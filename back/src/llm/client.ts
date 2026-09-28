import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import PQueue from "p-queue";
import { PipelineError } from "../documents/pipeline.js";
import { estimateCostUsd } from "./pricing.js";

export type LlmPurpose = "classify" | "extract" | "generate";
export type LlmMode = "live" | "replay" | "record";

export type LlmContentPart =
  | { type: "text"; text: string }
  | { type: "image"; data: Buffer; mimeType: string; detail: "low" | "high" | "auto" };

export type LlmRequest = {
  purpose: LlmPurpose;
  system: string;
  content: LlmContentPart[];
  // Structured Outputs : la réponse respecte strictement ce schéma JSON.
  responseSchema?: { name: string; schema: Record<string, unknown> };
  // Identifie l'entrée en mode replay à la place des octets des images, dont le rendu peut varier
  // d'une machine à l'autre. Ex. : `${sha256 du fichier}:p1-3`.
  replayKey: string;
};

export type LlmUsage = {
  purpose: LlmPurpose;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number | null;
  duration_ms: number;
  replayed: boolean;
};

export type LlmResponse = {
  text: string;
  usage: LlmUsage;
};

// Paramètres envoyés à l'API Chat Completions (sous-ensemble utilisé ici).
export type ChatParams = {
  model: string;
  messages: Array<
    | { role: "system"; content: string }
    | {
        role: "user";
        content: Array<
          | { type: "text"; text: string }
          | { type: "image_url"; image_url: { url: string; detail: "low" | "high" | "auto" } }
        >;
      }
  >;
  temperature?: number;
  store: false;
  response_format?: {
    type: "json_schema";
    json_schema: { name: string; schema: Record<string, unknown>; strict: true };
  };
};

export type ChatResult = {
  content: string | null;
  refusal: string | null;
  model: string;
  input_tokens: number;
  output_tokens: number;
};

// Appel réseau isolé pour pouvoir le remplacer en test.
export type ChatTransport = (params: ChatParams) => Promise<ChatResult>;

type RecordedResponse = {
  replay_key: string;
  purpose: LlmPurpose;
  model: string;
  recorded_at: string;
  text: string;
  input_tokens: number;
  output_tokens: number;
};

export class LlmUnavailableError extends PipelineError {
  constructor(message = "Service d'IA indisponible.") {
    super("LLM_UNAVAILABLE", message);
    this.name = "LlmUnavailableError";
  }
}

export class LlmRequestRejectedError extends PipelineError {
  constructor(message = "Requête refusée par le service d'IA.") {
    super("LLM_REQUEST_REJECTED", message);
    this.name = "LlmRequestRejectedError";
  }
}

export class LlmReplayMissingError extends PipelineError {
  constructor(file: string) {
    super("LLM_REPLAY_MISSING", `Aucune réponse enregistrée pour cette requête (${file}). Relancer en LLM_MODE=record.`);
    this.name = "LlmReplayMissingError";
  }
}

export type LlmClientOptions = {
  mode: LlmMode;
  models: Record<LlmPurpose, string>;
  fixturesDir: string;
  // Obligatoire en live / record, jamais appelé en replay.
  transport?: ChatTransport;
  maxConcurrency?: number;
};

// Classification et extraction doivent être reproductibles.
const TEMPERATURE: Record<LlmPurpose, number> = { classify: 0, extract: 0, generate: 0.3 };

// Clé de replay : tout ce qui définit la requête, sauf les octets des images (remplacés par replayKey) et le modèle.
export function replayHash(request: LlmRequest): string {
  const content = request.content.map((part) =>
    part.type === "text" ? part : { type: "image", mimeType: part.mimeType, detail: part.detail },
  );
  const material = JSON.stringify({
    purpose: request.purpose,
    system: request.system,
    content,
    schema: request.responseSchema ?? null,
    replayKey: request.replayKey,
  });
  return createHash("sha256").update(material).digest("hex").slice(0, 32);
}

function toChatParams(request: LlmRequest, model: string): ChatParams {
  return {
    model,
    temperature: TEMPERATURE[request.purpose],
    // Pas de conservation des requêtes côté OpenAI.
    store: false,
    messages: [
      { role: "system", content: request.system },
      {
        role: "user",
        content: request.content.map((part) =>
          part.type === "text"
            ? { type: "text" as const, text: part.text }
            : {
                type: "image_url" as const,
                image_url: {
                  url: `data:${part.mimeType};base64,${part.data.toString("base64")}`,
                  detail: part.detail,
                },
              },
        ),
      },
    ],
    ...(request.responseSchema && {
      response_format: {
        type: "json_schema" as const,
        json_schema: { name: request.responseSchema.name, schema: request.responseSchema.schema, strict: true as const },
      },
    }),
  };
}

function statusOf(error: unknown): number | undefined {
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

// Les nouveaux essais (429, 5xx, réseau) et le timeout sont gérés par le transport ; ici on ne fait que classer l'échec final.
function toLlmError(error: unknown): PipelineError {
  if (error instanceof PipelineError) {
    return error;
  }
  const status = statusOf(error);
  if (status !== undefined && status >= 400 && status < 500 && ![408, 409, 429].includes(status)) {
    return new LlmRequestRejectedError();
  }
  return new LlmUnavailableError();
}

export type LlmClient = {
  readonly mode: LlmMode;
  complete(request: LlmRequest): Promise<LlmResponse>;
};

export function createLlmClient(options: LlmClientOptions): LlmClient {
  if (options.mode !== "replay" && !options.transport) {
    throw new Error(`Un transport est requis en LLM_MODE=${options.mode}.`);
  }

  // Sémaphore global : au plus N appels simultanés, tous documents confondus.
  const limiter = new PQueue({ concurrency: options.maxConcurrency ?? 5 });

  function fixturePath(request: LlmRequest): string {
    return path.join(options.fixturesDir, request.purpose, `${replayHash(request)}.json`);
  }

  async function replay(request: LlmRequest): Promise<LlmResponse> {
    const file = fixturePath(request);
    let recorded: RecordedResponse;
    try {
      recorded = JSON.parse(await readFile(file, "utf8")) as RecordedResponse;
    } catch {
      throw new LlmReplayMissingError(path.relative(process.cwd(), file));
    }
    return {
      text: recorded.text,
      usage: {
        purpose: request.purpose,
        model: recorded.model,
        input_tokens: recorded.input_tokens,
        output_tokens: recorded.output_tokens,
        cost_usd: estimateCostUsd(recorded.model, recorded.input_tokens, recorded.output_tokens),
        duration_ms: 0,
        replayed: true,
      },
    };
  }

  async function call(request: LlmRequest): Promise<LlmResponse> {
    const model = options.models[request.purpose];
    const startedAt = Date.now();

    let result: ChatResult;
    try {
      result = await limiter.add(() => options.transport!(toChatParams(request, model)));
    } catch (error) {
      throw toLlmError(error);
    }

    if (result.refusal || result.content === null) {
      throw new LlmRequestRejectedError("Le service d'IA a refusé de traiter ce document.");
    }

    const response: LlmResponse = {
      text: result.content,
      usage: {
        purpose: request.purpose,
        model: result.model,
        input_tokens: result.input_tokens,
        output_tokens: result.output_tokens,
        cost_usd: estimateCostUsd(result.model, result.input_tokens, result.output_tokens),
        duration_ms: Date.now() - startedAt,
        replayed: false,
      },
    };

    if (options.mode === "record") {
      const file = fixturePath(request);
      const recorded: RecordedResponse = {
        replay_key: request.replayKey,
        purpose: request.purpose,
        model: result.model,
        recorded_at: new Date().toISOString(),
        text: result.content,
        input_tokens: result.input_tokens,
        output_tokens: result.output_tokens,
      };
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, `${JSON.stringify(recorded, null, 2)}\n`, "utf8");
    }

    return response;
  }

  return {
    mode: options.mode,
    complete: (request) => (options.mode === "replay" ? replay(request) : call(request)),
  };
}

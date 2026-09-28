import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLlmClient,
  replayHash,
  type ChatParams,
  type ChatResult,
  type LlmRequest,
} from "../src/llm/client.js";
import { estimateCostUsd } from "../src/llm/pricing.js";

const models = { classify: "gpt-4.1-mini", extract: "gpt-4.1", generate: "gpt-4.1" };

function request(overrides: Partial<LlmRequest> = {}): LlmRequest {
  return {
    purpose: "classify",
    system: "Classe le document.",
    content: [
      { type: "text", text: "Indice texte" },
      { type: "image", data: Buffer.from("image-page-1"), mimeType: "image/png", detail: "low" },
    ],
    responseSchema: { name: "classification", schema: { type: "object", properties: {}, additionalProperties: false } },
    replayKey: "sha-du-fichier:p1-3",
    ...overrides,
  };
}

function okResult(overrides: Partial<ChatResult> = {}): ChatResult {
  return {
    content: '{"type":"rccm"}',
    refusal: null,
    model: "gpt-4.1-mini-2025-04-14",
    input_tokens: 1000,
    output_tokens: 20,
    ...overrides,
  };
}

let fixturesDir: string;

beforeEach(async () => {
  fixturesDir = await mkdtemp(path.join(tmpdir(), "kyb-llm-"));
});

afterEach(async () => {
  await rm(fixturesDir, { recursive: true, force: true });
});

describe("mode live", () => {
  it("envoie modèle, température 0, store:false, schéma strict et images en data URL", async () => {
    const transport = vi.fn(async (_params: ChatParams) => okResult());
    const client = createLlmClient({ mode: "live", models, fixturesDir, transport });

    const response = await client.complete(request());

    const params = transport.mock.calls[0]![0];
    expect(params).toMatchObject({ model: "gpt-4.1-mini", temperature: 0, store: false });
    expect(params.response_format?.json_schema).toMatchObject({ name: "classification", strict: true });
    const user = params.messages[1];
    expect(user?.role).toBe("user");
    expect(JSON.stringify(user)).toContain(`data:image/png;base64,${Buffer.from("image-page-1").toString("base64")}`);
    expect(JSON.stringify(user)).toContain('"detail":"low"');

    expect(response.text).toBe('{"type":"rccm"}');
    expect(response.usage).toMatchObject({ purpose: "classify", input_tokens: 1000, output_tokens: 20, replayed: false });
    expect(response.usage.cost_usd).toBeCloseTo(estimateCostUsd("gpt-4.1-mini", 1000, 20)!);
  });

  it("utilise le modèle d'extraction pour une extraction", async () => {
    const transport = vi.fn(async (_params: ChatParams) => okResult());
    const client = createLlmClient({ mode: "live", models, fixturesDir, transport });

    await client.complete(request({ purpose: "extract" }));

    expect(transport.mock.calls[0]![0].model).toBe("gpt-4.1");
  });

  it("n'écrit aucune fixture en mode live", async () => {
    const client = createLlmClient({ mode: "live", models, fixturesDir, transport: async () => okResult() });
    await client.complete(request());
    expect(await readdir(fixturesDir)).toEqual([]);
  });

  it("classe une panne réseau / 5xx / 429 finale en LLM_UNAVAILABLE", async () => {
    for (const error of [Object.assign(new Error("boom"), { status: 503 }), Object.assign(new Error("rate"), { status: 429 }), new Error("ECONNRESET")]) {
      const client = createLlmClient({
        mode: "live",
        models,
        fixturesDir,
        transport: async () => {
          throw error;
        },
      });
      await expect(client.complete(request())).rejects.toMatchObject({ code: "LLM_UNAVAILABLE" });
    }
  });

  it("classe une requête invalide (400) en LLM_REQUEST_REJECTED", async () => {
    const client = createLlmClient({
      mode: "live",
      models,
      fixturesDir,
      transport: async () => {
        throw Object.assign(new Error("bad schema"), { status: 400 });
      },
    });
    await expect(client.complete(request())).rejects.toMatchObject({ code: "LLM_REQUEST_REJECTED" });
  });

  it("traite un refus du modèle comme une erreur", async () => {
    const client = createLlmClient({
      mode: "live",
      models,
      fixturesDir,
      transport: async () => okResult({ content: null, refusal: "I can't help with that." }),
    });
    await expect(client.complete(request())).rejects.toMatchObject({ code: "LLM_REQUEST_REJECTED" });
  });

  it("limite les appels simultanés (sémaphore global)", async () => {
    let active = 0;
    let maxActive = 0;
    const client = createLlmClient({
      mode: "live",
      models,
      fixturesDir,
      maxConcurrency: 5,
      transport: async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active--;
        return okResult();
      },
    });

    await Promise.all(Array.from({ length: 12 }, (_, i) => client.complete(request({ replayKey: `k${i}` }))));

    expect(maxActive).toBe(5);
  });
});

describe("modes record / replay", () => {
  it("rejoue sans appel réseau ce qui a été enregistré", async () => {
    const recorder = createLlmClient({ mode: "record", models, fixturesDir, transport: async () => okResult() });
    await recorder.complete(request());

    const files = await readdir(path.join(fixturesDir, "classify"));
    expect(files).toHaveLength(1);
    const recorded = JSON.parse(await readFile(path.join(fixturesDir, "classify", files[0]!), "utf8"));
    expect(recorded).toMatchObject({ replay_key: "sha-du-fichier:p1-3", text: '{"type":"rccm"}' });
    // Les images ne sont jamais écrites dans les fixtures.
    expect(JSON.stringify(recorded)).not.toContain(Buffer.from("image-page-1").toString("base64"));

    const transport = vi.fn(async () => okResult());
    const replayer = createLlmClient({ mode: "replay", models, fixturesDir, transport });
    const response = await replayer.complete(request());

    expect(transport).not.toHaveBeenCalled();
    expect(response.text).toBe('{"type":"rccm"}');
    expect(response.usage).toMatchObject({ replayed: true, duration_ms: 0, input_tokens: 1000 });
  });

  it("fonctionne sans transport ni clé en replay", () => {
    expect(() => createLlmClient({ mode: "replay", models, fixturesDir })).not.toThrow();
    expect(() => createLlmClient({ mode: "live", models, fixturesDir })).toThrow();
  });

  it("échoue clairement s'il n'y a pas de réponse enregistrée", async () => {
    const replayer = createLlmClient({ mode: "replay", models, fixturesDir });
    await expect(replayer.complete(request())).rejects.toMatchObject({ code: "LLM_REPLAY_MISSING" });
  });
});

describe("replayHash", () => {
  it("ne dépend pas des octets des images (rendu variable selon la machine)", () => {
    const other = request({
      content: [
        { type: "text", text: "Indice texte" },
        { type: "image", data: Buffer.from("rendu-legerement-different"), mimeType: "image/png", detail: "low" },
      ],
    });
    expect(replayHash(other)).toBe(replayHash(request()));
  });

  it("change si le prompt, le texte, le schéma ou la clé de replay changent", () => {
    const base = replayHash(request());
    expect(replayHash(request({ system: "Autre prompt" }))).not.toBe(base);
    expect(replayHash(request({ replayKey: "autre-fichier:p1-3" }))).not.toBe(base);
    expect(replayHash(request({ purpose: "extract" }))).not.toBe(base);
    expect(replayHash(request({ content: [{ type: "text", text: "Autre indice" }] }))).not.toBe(base);
    expect(replayHash(request({ responseSchema: { name: "autre", schema: {} } }))).not.toBe(base);
  });
});

describe("estimateCostUsd", () => {
  it("reconnaît les noms de modèle datés et renvoie null pour un modèle inconnu", () => {
    expect(estimateCostUsd("gpt-4.1-2025-04-14", 1_000_000, 0)).toBe(2);
    expect(estimateCostUsd("gpt-4.1-mini-2025-04-14", 1_000_000, 1_000_000)).toBeCloseTo(2);
    expect(estimateCostUsd("modele-inconnu", 1000, 1000)).toBeNull();
  });
});

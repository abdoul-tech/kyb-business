// Vérifie la configuration OpenAI : clé valide, modèles accessibles, vision + Structured Outputs.
// Un seul appel réel minuscule (image basse résolution + quelques tokens) : coût < 0,001 USD.
// Usage : npm run llm:check --workspace=back
import OpenAI from "openai";
import { makePdf } from "../tests/helpers/pdf.js";

const { env } = await import("../src/config/env.js");
const { createLlmClient } = await import("../src/llm/client.js");
const { createOpenAiTransport } = await import("../src/llm/openai-transport.js");
const { renderDocument } = await import("../src/documents/renderer.js");

if (!env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY absente de back/.env");
  process.exit(1);
}

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 30_000 });
const models = { classify: env.LLM_MODEL_CLASSIFY, extract: env.LLM_MODEL_EXTRACT, generate: env.LLM_MODEL_GENERATE };

let ok = true;
for (const [purpose, model] of Object.entries(models)) {
  try {
    await openai.models.retrieve(model);
    console.log(`✓ ${purpose.padEnd(8)} ${model} accessible`);
  } catch (error) {
    ok = false;
    const status = (error as { status?: number }).status;
    console.log(`✗ ${purpose.padEnd(8)} ${model} inaccessible (HTTP ${status ?? "?"})`);
  }
}
if (!ok) {
  console.error("\nClé invalide ou modèle non autorisé pour ce compte : ajuster LLM_MODEL_* dans back/.env.");
  process.exit(1);
}

const [page] = await renderDocument(
  makePdf(1, { text: () => "EXTRAIT DU REGISTRE DU COMMERCE ET DU CREDIT MOBILIER" }),
  "application/pdf",
  { dpi: 72 },
);

const client = createLlmClient({
  mode: "live",
  models,
  fixturesDir: "unused",
  transport: createOpenAiTransport(env.OPENAI_API_KEY),
});

const response = await client.complete({
  purpose: "classify",
  system: "Tu classes des documents d'entreprise. Réponds uniquement selon le schéma.",
  content: [
    { type: "text", text: "Quel est le type de ce document ?" },
    { type: "image", data: page!.image, mimeType: page!.image_mime_type, detail: "low" },
  ],
  responseSchema: {
    name: "classification",
    schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["rccm", "statuts", "id_document", "unknown"] },
        confidence: { type: "number" },
      },
      required: ["type", "confidence"],
      additionalProperties: false,
    },
  },
  replayKey: "llm-check",
});

const parsed = JSON.parse(response.text) as { type: string; confidence: number };
const { usage } = response;
console.log(`✓ vision + Structured Outputs : type=${parsed.type}, confiance=${parsed.confidence}`);
console.log(
  `  ${usage.model} · ${usage.input_tokens} tokens entrée / ${usage.output_tokens} sortie · ` +
    `${usage.cost_usd === null ? "coût inconnu" : `${usage.cost_usd.toFixed(5)} USD`} · ${usage.duration_ms} ms`,
);

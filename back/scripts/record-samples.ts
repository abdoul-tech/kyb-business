// Classe et extrait les documents fictifs de tests/helpers/samples.ts avec le vrai LLM, et enregistre
// les réponses dans fixtures/llm pour que tests/samples.test.ts les rejoue sans clé (LLM_MODE=replay).
// Usage : npm run llm:record-samples --workspace=back   (coût : quelques centimes)
import { fileURLToPath } from "node:url";
import { makeRecord } from "../tests/helpers/memory-store.js";
import { samples } from "../tests/helpers/samples.js";

const { env } = await import("../src/config/env.js");
const { createLlmClient } = await import("../src/llm/client.js");
const { createOpenAiTransport } = await import("../src/llm/openai-transport.js");
const { createClassifier } = await import("../src/documents/classifier.js");
const { createExtractor } = await import("../src/documents/extractor.js");

if (!env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY absente de back/.env");
  process.exit(1);
}

const llm = createLlmClient({
  mode: "record",
  models: { classify: env.LLM_MODEL_CLASSIFY, extract: env.LLM_MODEL_EXTRACT, generate: env.LLM_MODEL_GENERATE },
  fixturesDir: fileURLToPath(new URL("../../fixtures/llm", import.meta.url)),
  transport: createOpenAiTransport(env.OPENAI_API_KEY),
});
const classify = createClassifier(llm);
const extract = createExtractor(llm, { dpi: env.PDF_RENDER_DPI });

let totalCost = 0;
for (const sample of samples) {
  const document = makeRecord({ sha256: sample.sha256, page_count: sample.pageCount, mime_type: "application/pdf" });
  const classification = await classify({ document, content: sample.pdf });
  const extraction = await extract({ document, content: sample.pdf, type: classification.type });

  const usage = [...classification.usage, ...extraction.usage];
  const cost = usage.reduce((sum, u) => sum + (u.cost_usd ?? 0), 0);
  const seconds = usage.reduce((sum, u) => sum + u.duration_ms, 0) / 1000;
  totalCost += cost;

  const ok = classification.type === sample.expectedType ? "✓" : "✗";
  console.log(`\n${ok} ${sample.name} → ${classification.type} (confiance ${classification.confidence})`);
  console.log(`  ${usage.length} appel(s) · ${cost.toFixed(4)} USD · ${seconds.toFixed(1)} s`);
  console.log(JSON.stringify(extraction.data, null, 1).slice(0, 4000));
}
console.log(`\nCoût total : ${totalCost.toFixed(4)} USD`);

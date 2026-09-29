// Évaluation de la classification et de l'extraction sur le jeu `fixtures/<dossier>/expected.json`.
// Usage (depuis la racine) :
//   npm run eval                          pipeline réel (LLM live), tous les dossiers
//   npm run eval -- --dossier=barry       dossiers dont le nom contient « barry »
//   npm run eval -- --mode=replay         rejoue fixtures/llm (sans clé, sans coût)
//   npm run eval -- --mode=record         live + enregistrement pour le replay (interdit sur fixtures/private)
// Le rapport détaillé (valeurs extraites comprises) est écrit dans eval-results/, ignoré par git.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key!, value ?? "true"] as const;
  }),
);
const mode = (args.get("mode") ?? "live") as "live" | "record" | "replay";
if (!["live", "record", "replay"].includes(mode)) {
  console.error(`--mode invalide : ${mode} (live | record | replay)`);
  process.exit(1);
}
// La config globale est validée avec le mode demandé (clé OpenAI inutile en replay).
process.env.LLM_MODE = mode;

const { env } = await import("../src/config/env.js");
const { createLlmClient } = await import("../src/llm/client.js");
const { createOpenAiTransport } = await import("../src/llm/openai-transport.js");
const { loadDataset } = await import("../src/eval/dataset.js");
const { runEval } = await import("../src/eval/run.js");
const { formatReport } = await import("../src/eval/report.js");
const { aggregate } = await import("../src/eval/scoring.js");

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const fixturesRoot = path.join(repoRoot, "fixtures");

const dossiers = await loadDataset(fixturesRoot, args.get("dossier"));
if (dossiers.length === 0) {
  console.error("Aucun dossier trouvé : ajouter fixtures/<dossier>/expected.json (voir fixtures/README.md).");
  process.exit(1);
}
if (mode === "record" && dossiers.some((d) => d.name.startsWith("private/"))) {
  // Les réponses enregistrées contiennent les valeurs extraites et sont versionnées.
  console.error("--mode=record interdit sur fixtures/private : utiliser --mode=live.");
  process.exit(1);
}

const documentCount = dossiers.reduce((n, d) => n + d.documents.length, 0);
console.log(`Évaluation (${mode}) : ${dossiers.length} dossier(s), ${documentCount} document(s)\n`);

const llm = createLlmClient({
  mode,
  models: { classify: env.LLM_MODEL_CLASSIFY, extract: env.LLM_MODEL_EXTRACT, generate: env.LLM_MODEL_GENERATE },
  fixturesDir: env.LLM_FIXTURES_DIR ?? path.join(fixturesRoot, "llm"),
  transport: env.OPENAI_API_KEY && mode !== "replay" ? createOpenAiTransport(env.OPENAI_API_KEY) : undefined,
});

let done = 0;
const results = await runEval(dossiers, {
  llm,
  dpi: env.PDF_RENDER_DPI,
  limits: { maxBytes: env.MAX_FILE_BYTES, maxPages: env.MAX_PAGES },
  onResult: (result) => {
    done++;
    const ok = result.classified_type === result.expected_type ? "✓" : "✗";
    console.log(`  [${done}/${documentCount}] ${ok} ${result.dossier}/${result.file}`);
  },
});

console.log(`\n${formatReport(results)}`);

const outDir = path.join(repoRoot, "eval-results");
await mkdir(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outFile = path.join(outDir, `${stamp}-${mode}.json`);
const { total } = aggregate(results);
await writeFile(
  outFile,
  `${JSON.stringify(
    {
      mode,
      models: { classify: env.LLM_MODEL_CLASSIFY, extract: env.LLM_MODEL_EXTRACT },
      dpi: env.PDF_RENDER_DPI,
      total,
      results,
    },
    null,
    2,
  )}\n`,
);
console.log(`\nRapport détaillé : ${path.relative(repoRoot, outFile)}`);

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { loadDataset } from "../src/eval/dataset.js";
import { formatReport } from "../src/eval/report.js";
import { runEval } from "../src/eval/run.js";
import { aggregate, resolveField, scoreField, type DocumentResult } from "../src/eval/scoring.js";
import { createLlmClient } from "../src/llm/client.js";
import { passportSample, rccmSample, statutsSample } from "./helpers/samples.js";

const f = (value: unknown, confidence = 0.95, source_page: number | null = 1) => ({ value, confidence, source_page });

const extraction = {
  legal_name: f("SAHEL NEGOCE"),
  legal_form_explicit: f(null, 0, null),
  registered_address: f({ full_address: "Lot 45, Ouagadougou", raw_components: null }, 0.7),
  shareholders: [{ last_name: f("OUEDRAOGO"), ownership_pct: f(60, 0.9) }],
  officers: [],
};

describe("resolveField", () => {
  it("traverse les enveloppes value/confidence, y compris dans les listes et les objets", () => {
    expect(resolveField(extraction, "legal_name")).toEqual({ value: "SAHEL NEGOCE", confidence: 0.95 });
    expect(resolveField(extraction, "shareholders[0].ownership_pct")).toEqual({ value: 60, confidence: 0.9 });
    expect(resolveField(extraction, "registered_address.full_address")).toEqual({
      value: "Lot 45, Ouagadougou",
      confidence: 0.7,
    });
  });

  it("renvoie null pour un élément de liste ou un champ absent", () => {
    expect(resolveField(extraction, "officers[0].last_name").value).toBeNull();
    expect(resolveField(extraction, "shareholders[3].last_name").value).toBeNull();
    expect(resolveField(extraction, "inexistant").value).toBeNull();
  });
});

describe("scoreField", () => {
  it("classe chaque cas : correct, manquant, faux, vide correct, faux positif", () => {
    expect(scoreField("legal_name", "Sahel  negoce", extraction).outcome).toBe("correct");
    expect(scoreField("officers[0].last_name", "OUEDRAOGO", extraction).outcome).toBe("missing");
    expect(scoreField("shareholders[0].ownership_pct", 40, extraction).outcome).toBe("wrong");
    expect(scoreField("legal_form_explicit", null, extraction).outcome).toBe("correct_empty");
    expect(scoreField("legal_name", null, extraction).outcome).toBe("false_positive");
  });

  it("est tolérant à la casse et aux espaces, pas aux accents", () => {
    const data = { first_name: f("Aicha") };
    expect(scoreField("first_name", "Aïcha", data).outcome).toBe("wrong");
    expect(scoreField("first_name", "  AICHA ", data).outcome).toBe("correct");
  });
});

function result(overrides: Partial<DocumentResult>): DocumentResult {
  return {
    dossier: "d",
    file: "x.pdf",
    expected_type: "rccm",
    classified_type: "rccm",
    classification_confidence: 0.9,
    extraction: "done",
    error_code: null,
    fields: [],
    cost_usd: 0.01,
    duration_ms: 1000,
    ...overrides,
  };
}

describe("aggregate", () => {
  it("calcule classification, champs corrects, faux positifs et erreurs confiantes par type", () => {
    const results = [
      result({
        fields: [
          scoreField("legal_name", "SAHEL NEGOCE", extraction),
          scoreField("shareholders[0].ownership_pct", 40, extraction),
          scoreField("legal_name", null, extraction),
          scoreField("legal_form_explicit", null, extraction),
          scoreField("registered_address.full_address", "Autre adresse", extraction),
        ],
      }),
      result({ expected_type: "statuts", classified_type: "rccm", fields: [] }),
    ];

    const { byType, total } = aggregate(results);

    expect(byType.get("rccm")).toMatchObject({
      documents: 1,
      classification_correct: 1,
      expected_values: 3,
      correct: 1,
      wrong: 2,
      expected_empty: 2,
      false_positives: 1,
      // ownership_pct (0,9) et le faux positif legal_name (0,95) ; l'adresse fausse est à 0,7 donc signalée.
      confident_errors: 2,
    });
    expect(byType.get("statuts")).toMatchObject({ documents: 1, classification_correct: 0 });
    expect(total).toMatchObject({ documents: 2, classification_correct: 1, cost_usd: 0.02 });
  });

  it("signale dans le rapport l'objectif non atteint et le détail des écarts", () => {
    const report = formatReport([
      result({ fields: [scoreField("shareholders[0].ownership_pct", 40, extraction)] }),
      result({ file: "y.pdf", expected_type: "statuts", classified_type: "rccm", extraction: "failed", error_code: "EXTRACTION_INVALID" }),
    ]);

    expect(report).toContain("NON ATTEINT");
    expect(report).toContain("d/x.pdf");
    expect(report).toContain("shareholders[0].ownership_pct");
    expect(report).toContain("attendu statuts, obtenu rccm");
    expect(report).toContain("extraction échouée : EXTRACTION_INVALID");
  });
});

describe("loadDataset", () => {
  let root: string;
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("trouve fixtures/<dossier> et fixtures/private/<dossier>, ignore fixtures/llm, valide expected.json", async () => {
    root = await mkdtemp(path.join(tmpdir(), "kyb-eval-"));
    for (const dir of ["a", "private/b", "llm/classify"]) {
      await mkdir(path.join(root, dir), { recursive: true });
    }
    const expected = { documents: { "doc.pdf": { type: "rccm", fields: { legal_name: "X" } } } };
    await writeFile(path.join(root, "a", "expected.json"), JSON.stringify(expected));
    await writeFile(path.join(root, "a", "doc.pdf"), "pdf");
    await writeFile(path.join(root, "private/b", "expected.json"), JSON.stringify(expected));
    await writeFile(path.join(root, "private/b", "doc.pdf"), "pdf");

    const dossiers = await loadDataset(root);
    expect(dossiers.map((d) => d.name)).toEqual(["a", "private/b"]);
    expect(await loadDataset(root, "private")).toHaveLength(1);

    await writeFile(path.join(root, "a", "expected.json"), JSON.stringify({ documents: { "absent.pdf": { type: "rccm" } } }));
    await expect(loadDataset(root)).rejects.toThrow(/absent\.pdf/);

    await writeFile(path.join(root, "a", "expected.json"), JSON.stringify({ documents: { "doc.pdf": { type: "facture" } } }));
    await expect(loadDataset(root)).rejects.toThrow(/expected\.json invalide/);
  });
});

describe("runEval sur fixtures/fictif-demo (replay)", () => {
  const fixturesRoot = fileURLToPath(new URL("../../fixtures", import.meta.url));

  it("les PDF versionnés sont identiques aux documents fictifs (sinon le replay ne correspond plus)", async () => {
    const [dossier] = await loadDataset(fixturesRoot, "fictif-demo");
    const byFile = new Map(dossier!.documents.map((d) => [d.file, d.content]));
    expect(byFile.get("rccm-barry-auto.pdf")?.equals(rccmSample.pdf)).toBe(true);
    expect(byFile.get("statuts-sahel-negoce.pdf")?.equals(statutsSample.pdf)).toBe(true);
    expect(byFile.get("passeport-specimen.pdf")?.equals(passportSample.pdf)).toBe(true);
  });

  it("classe et extrait les 3 documents, 100 % des champs attendus", async () => {
    const dossiers = await loadDataset(fixturesRoot, "fictif-demo");
    const llm = createLlmClient({
      mode: "replay",
      models: { classify: "replay", extract: "replay", generate: "replay" },
      fixturesDir: path.join(fixturesRoot, "llm"),
    });

    const results = await runEval(dossiers, { llm, dpi: 72, limits: { maxBytes: 15 * 1024 * 1024, maxPages: 30 } });
    const { total } = aggregate(results);

    expect(results.map((r) => r.file)).toEqual([
      "rccm-barry-auto.pdf",
      "statuts-sahel-negoce.pdf",
      "passeport-specimen.pdf",
    ]);
    expect(total.classification_correct).toBe(3);
    expect(total.correct).toBe(total.expected_values);
    expect(total.false_positives).toBe(0);
  });
});

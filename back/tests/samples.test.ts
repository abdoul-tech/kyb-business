// Rejoue (LLM_MODE=replay, sans clé ni réseau) les réponses enregistrées par `npm run llm:record-samples`
// sur les documents fictifs, et vérifie classification + extraction de bout en bout.
// Un changement de prompt ou de schéma invalide les enregistrements : relancer le script d'enregistrement.
import { fileURLToPath } from "node:url";
import type { IdDocument, Rccm, Statuts } from "@kyb/shared";
import { describe, expect, it } from "vitest";
import { createClassifier } from "../src/documents/classifier.js";
import { createExtractor } from "../src/documents/extractor.js";
import { createLlmClient } from "../src/llm/client.js";
import { makeRecord } from "./helpers/memory-store.js";
import { passportSample, rccmSample, statutsSample, type Sample } from "./helpers/samples.js";

const llm = createLlmClient({
  mode: "replay",
  models: { classify: "replay", extract: "replay", generate: "replay" },
  fixturesDir: fileURLToPath(new URL("../../fixtures/llm", import.meta.url)),
});
const classify = createClassifier(llm);
// Même DPI que l'enregistrement n'est pas nécessaire : la clé de replay ignore les octets des images.
const extract = createExtractor(llm, { dpi: 72 });

async function run<T>(sample: Sample) {
  const document = makeRecord({ sha256: sample.sha256, page_count: sample.pageCount, mime_type: "application/pdf" });
  const classification = await classify({ document, content: sample.pdf });
  const extraction = await extract({ document, content: sample.pdf, type: classification.type });
  return { classification, data: extraction.data as T, usage: [...classification.usage, ...extraction.usage] };
}

describe("documents fictifs rejoués", () => {
  it("RCCM : aucune forme juridique déduite du « SARL » accolé au nom (cas SAIDOU AUTO)", async () => {
    const { classification, data, usage } = await run<Rccm>(rccmSample);

    expect(classification.type).toBe("rccm");
    expect(classification.confidence).toBeGreaterThanOrEqual(0.7);
    expect(data.legal_name.value).toBe("BARRY AUTO SARL");
    expect(data.legal_form_explicit.value).toBeNull();
    expect(data.rccm_number.value).toBe("NE-NIM-01-2019-B12-00987");
    expect(data.registration_date.value).toBe("2019-03-14");
    expect(data.country.value).toBe("NER");
    expect(data.capital_amount.value).toBe(1_000_000);
    expect(data.capital_currency.value).toBe("XOF");
    expect(data.officers).toHaveLength(1);
    expect(data.officers[0]!.last_name.value).toBe("BARRY");
    // « 01/01 » conservé tel quel.
    expect(data.officers[0]!.date_of_birth.value).toBe("1980-01-01");
    expect(usage.every((u) => u.replayed)).toBe(true);
  });

  it("statuts : forme juridique explicite, répartition du capital et gérant", async () => {
    const { classification, data } = await run<Statuts>(statutsSample);

    expect(classification.type).toBe("statuts");
    expect(data.legal_name.value).toBe("SAHEL NEGOCE");
    expect(data.legal_form_explicit.value?.toLowerCase()).toBe("société à responsabilité limitée");
    expect(data.capital_amount.value).toBe(2_000_000);
    expect(data.shareholders.map((s) => [s.last_name.value, s.shares_count.value, s.ownership_pct.value])).toEqual([
      ["OUEDRAOGO", 120, 60],
      ["SAWADOGO", 80, 40],
    ]);
    expect(data.shareholders[1]!.first_name.value).toBe("Aïcha");
    expect(data.officers[0]!.role.value?.toLowerCase()).toBe("gérant");
    expect(data.capital_amount.source_page).toBe(2);
  });

  it("passeport : identité, dates ISO et type de pièce", async () => {
    const { classification, data } = await run<IdDocument>(passportSample);

    expect(classification.type).toBe("id_document");
    expect(data.last_name.value).toBe("SPECIMEN");
    expect(data.first_name.value).toBe("FATOU");
    expect(data.date_of_birth.value).toBe("1990-01-01");
    expect(data.expiry_date.value).toBe("2032-02-14");
    expect(data.document_type.value).toBe("Passeport");
    expect(data.document_number.value).toBe("A00000000");
  });
});

import { IdDocumentSchema, RccmSchema, StatutsSchema } from "@kyb/shared";
import { describe, expect, it, vi } from "vitest";
import { createClassifier } from "../src/documents/classifier.js";
import { createExtractor } from "../src/documents/extractor.js";
import { normalizeExtraction } from "../src/documents/normalize.js";
import type { LlmClient, LlmRequest, LlmResponse } from "../src/llm/client.js";
import { toStrictJsonSchema } from "../src/llm/json-schema.js";
import { makeRecord } from "./helpers/memory-store.js";
import { makePdf } from "./helpers/pdf.js";

const field = (value: unknown, confidence = 0.95, source_page: number | null = 1) => ({ value, confidence, source_page });

function validIdDocument() {
  return {
    first_name: field("Awa"),
    last_name: field("DIOP"),
    middle_names: field(null, 0, null),
    date_of_birth: field("1980-01-01"),
    nationality: field("Sénégalaise"),
    address: field(null, 0, null),
    expiry_date: field("2031-06-30"),
    document_type: field("Passeport"),
    document_number: field("A01234567"),
    issuing_authority: field("DGPAF"),
    npi: field(null, 0, null),
  };
}

function fakeLlm(...texts: string[]) {
  const calls: LlmRequest[] = [];
  const client: LlmClient = {
    mode: "live",
    complete: vi.fn(async (request: LlmRequest): Promise<LlmResponse> => {
      calls.push(request);
      const text = texts[Math.min(calls.length - 1, texts.length - 1)]!;
      return {
        text,
        usage: {
          purpose: request.purpose,
          model: "gpt-test",
          input_tokens: 1000,
          output_tokens: 100,
          cost_usd: 0.01,
          duration_ms: 5,
          replayed: false,
        },
      };
    }),
  };
  return { client, calls };
}

const pdfDocument = makeRecord({ mime_type: "application/pdf", sha256: "abc123", page_count: 2 });
const pdf = makePdf(2, { text: (i) => `PASSEPORT page ${i + 1}` });

describe("toStrictJsonSchema", () => {
  it("produit des objets fermés dont tous les champs sont obligatoires, sans mot-clé non supporté", () => {
    for (const schema of [RccmSchema, StatutsSchema, IdDocumentSchema]) {
      const json = toStrictJsonSchema(schema);
      const serialized = JSON.stringify(json);
      expect(serialized).not.toMatch(/"\$schema"|"minimum"|"maximum"/);

      const visit = (node: unknown): void => {
        if (Array.isArray(node)) {
          node.forEach(visit);
        } else if (node && typeof node === "object") {
          const obj = node as Record<string, unknown>;
          if (obj.type === "object" && obj.properties) {
            expect(obj.additionalProperties).toBe(false);
            expect(obj.required).toEqual(Object.keys(obj.properties as object));
          }
          Object.values(obj).forEach(visit);
        }
      };
      visit(json);
    }
  });
});

describe("createClassifier", () => {
  it("envoie au plus 3 pages en basse résolution et renvoie type, confiance et coût", async () => {
    const { client, calls } = fakeLlm('{"type":"id_document","confidence":0.97}');
    const classify = createClassifier(client);

    const result = await classify({ document: { ...pdfDocument, page_count: 5 }, content: makePdf(5) });

    expect(result).toMatchObject({ type: "id_document", confidence: 0.97 });
    expect(result.usage).toHaveLength(1);
    const request = calls[0]!;
    expect(request.purpose).toBe("classify");
    expect(request.replayKey).toBe("abc123:classify");
    const images = request.content.filter((part) => part.type === "image");
    expect(images).toHaveLength(3);
    expect(images.every((part) => part.type === "image" && part.detail === "low")).toBe(true);
  });

  it("échoue en CLASSIFICATION_INVALID sur une réponse hors schéma, en gardant le coût", async () => {
    const { client } = fakeLlm('{"type":"facture","confidence":0.9}');
    const classify = createClassifier(client);

    const error = await classify({ document: pdfDocument, content: pdf }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: "CLASSIFICATION_INVALID" });
    expect((error as { usage: unknown[] }).usage).toHaveLength(1);
  });
});

describe("createExtractor", () => {
  it("extrait une pièce d'identité : toutes les pages en haute définition + texte embarqué", async () => {
    const { client, calls } = fakeLlm(JSON.stringify(validIdDocument()));
    const extract = createExtractor(client, { dpi: 72 });

    const result = await extract({ document: pdfDocument, content: pdf, type: "id_document" });

    expect(result.data).toMatchObject({ last_name: field("DIOP"), date_of_birth: field("1980-01-01") });
    const request = calls[0]!;
    expect(request).toMatchObject({ purpose: "extract", replayKey: "abc123:extract:id_document" });
    expect(request.system).toContain("pièce d'identité");
    expect(request.responseSchema?.name).toBe("extraction_id_document");
    const images = request.content.filter((part) => part.type === "image");
    expect(images).toHaveLength(2);
    expect(images.every((part) => part.type === "image" && part.detail === "high")).toBe(true);
    expect(JSON.stringify(request.content)).toContain("PASSEPORT page 2");
  });

  it("refait un seul essai avec les erreurs de validation, sans y mettre de valeur extraite", async () => {
    const invalid = { ...validIdDocument(), last_name: { value: "DIOP" } };
    const { client, calls } = fakeLlm(JSON.stringify(invalid), JSON.stringify(validIdDocument()));
    const extract = createExtractor(client, { dpi: 72 });

    const result = await extract({ document: pdfDocument, content: pdf, type: "id_document" });

    expect(calls).toHaveLength(2);
    expect(result.usage).toHaveLength(2);
    const correction = calls[1]!.content.at(-1);
    expect(correction?.type === "text" && correction.text).toContain("last_name");
    expect(JSON.stringify(correction)).not.toContain("DIOP");
  });

  it("passe en EXTRACTION_INVALID après deux réponses invalides, avec le coût des deux appels", async () => {
    const { client, calls } = fakeLlm("pas du json");
    const extract = createExtractor(client, { dpi: 72 });

    const error = await extract({ document: pdfDocument, content: pdf, type: "rccm" }).catch((caught: unknown) => caught);

    expect(calls).toHaveLength(2);
    expect(error).toMatchObject({ code: "EXTRACTION_INVALID" });
    expect((error as { usage: unknown[] }).usage).toHaveLength(2);
  });

  it("refuse les types sans extraction disponible au J2", async () => {
    const { client, calls } = fakeLlm("{}");
    const extract = createExtractor(client, { dpi: 72 });

    await expect(extract({ document: pdfDocument, content: pdf, type: "tax_certificate" })).rejects.toMatchObject({
      code: "EXTRACTION_NOT_SUPPORTED",
    });
    expect(calls).toHaveLength(0);
  });
});

describe("normalizeExtraction", () => {
  it("nettoie les textes et vide les dates non ISO sans les corriger", () => {
    const data = normalizeExtraction(
      {
        ...validIdDocument(),
        first_name: field("  Awa  "),
        nationality: field("   "),
        date_of_birth: field("01/01/1980"),
        expiry_date: field("2031-02-30"),
      },
      2,
    );

    expect(data.first_name).toEqual(field("Awa"));
    expect(data.nationality).toEqual(field(null, 0, null));
    expect(data.date_of_birth).toEqual(field(null, 0, null));
    expect(data.expiry_date).toEqual(field(null, 0, null));
    expect(data.last_name).toEqual(field("DIOP"));
  });

  it("garde un 01/01 au format ISO tel quel", () => {
    const data = normalizeExtraction(validIdDocument(), 1);
    expect(data.date_of_birth).toEqual(field("1980-01-01"));
  });

  it("retire une page source qui n'existe pas dans le document, y compris dans les listes", () => {
    const data = normalizeExtraction(
      { officers: [{ role: field("Gérant", 0.9, 7) }], legal_name: field("X SARL", 0.9, 1) },
      2,
    );
    expect(data.officers[0]!.role).toEqual(field("Gérant", 0.9, null));
    expect(data.legal_name).toEqual(field("X SARL", 0.9, 1));
  });
});

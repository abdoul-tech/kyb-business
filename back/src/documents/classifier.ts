import { documentTypeCatalog, documentTypeSlugValues, DocumentTypeSlugSchema } from "@kyb/shared";
import { z } from "zod";
import type { LlmClient, LlmContentPart } from "../llm/client.js";
import { toStrictJsonSchema } from "../llm/json-schema.js";
import type { AllowedMimeType } from "./file-check.js";
import { PipelineError, type Classifier } from "./pipeline.js";
import { renderDocument } from "./renderer.js";

// Spec : un appel court, en basse résolution, sur les 3 premières pages.
const CLASSIFY_PAGES = [1, 2, 3];
const CLASSIFY_DPI = 100;
const MAX_CLASSIFY_TEXT_CHARS = 4_000;

const ClassificationSchema = z.strictObject({
  type: DocumentTypeSlugSchema,
  confidence: z.number().min(0).max(1),
});

const classificationJsonSchema = toStrictJsonSchema(ClassificationSchema);

const typeList = documentTypeSlugValues
  .map((slug) => `- ${slug} : ${documentTypeCatalog[slug].label_fr}`)
  .join("\n");

export const CLASSIFICATION_SYSTEM_PROMPT = `Tu identifies le type d'un document d'entreprise d'Afrique francophone, fourni dans le cadre d'une ouverture de compte (KYB).
Tu reçois les premières pages en image, et parfois le texte embarqué du PDF comme indice.

Types possibles :
${typeList}

Consignes :
- Choisis le type qui correspond au document lui-même, pas aux documents qu'il cite (des statuts mentionnent le RCCM sans en être un).
- rccm : extrait ou certificat d'immatriculation au registre du commerce. rccm_modificatif : inscription modificative.
- id_document : uniquement une pièce d'identité officielle d'une personne (passeport, CNI). Une carte professionnelle,
  une carte d'importateur ou une carte d'électeur n'en sont pas.
- unknown : si aucun type ne convient ou si le document est illisible.
- "confidence" entre 0 et 1 : 0,9 et plus seulement si le titre ou le contenu ne laisse aucun doute.`;

export function createClassifier(llm: LlmClient): Classifier {
  return async ({ document, content }) => {
    const pages = await renderDocument(content, document.mime_type as AllowedMimeType, {
      dpi: CLASSIFY_DPI,
      pages: CLASSIFY_PAGES,
    });

    const parts: LlmContentPart[] = [
      { type: "text", text: `Premières pages du document (${pages.length} sur ${document.page_count ?? "?"}).` },
    ];
    const textHint = pages
      .map((page) => page.text)
      .join("\n")
      .slice(0, MAX_CLASSIFY_TEXT_CHARS)
      .trim();
    if (textHint) {
      parts.push({ type: "text", text: `Texte embarqué (indice) :\n${textHint}` });
    }
    for (const page of pages) {
      parts.push({ type: "image", data: page.image, mimeType: page.image_mime_type, detail: "low" });
    }

    const response = await llm.complete({
      purpose: "classify",
      system: CLASSIFICATION_SYSTEM_PROMPT,
      content: parts,
      responseSchema: { name: "document_classification", schema: classificationJsonSchema },
      replayKey: `${document.sha256}:classify`,
    });

    let parsed: z.infer<typeof ClassificationSchema>;
    try {
      parsed = ClassificationSchema.parse(JSON.parse(response.text));
    } catch {
      const error = new PipelineError("CLASSIFICATION_INVALID", "Réponse de classification invalide.");
      error.usage = [response.usage];
      throw error;
    }

    return { type: parsed.type, confidence: parsed.confidence, usage: [response.usage] };
  };
}

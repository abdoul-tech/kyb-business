import type { z } from "zod";
import type { LlmClient, LlmContentPart, LlmUsage } from "../llm/client.js";
import { toStrictJsonSchema } from "../llm/json-schema.js";
import type { AllowedMimeType } from "./file-check.js";
import { normalizeExtraction } from "./normalize.js";
import { PipelineError, type Extractor } from "./pipeline.js";
import { renderDocument, type RenderedPage } from "./renderer.js";
import { EXTRACTION_SYSTEM_PROMPT, MAX_TEXT_HINT_CHARS } from "./types/prompts.js";
import { getDocumentTypeDefinition, type DocumentTypeDefinition } from "./types/index.js";

export type ExtractorOptions = {
  dpi: number;
};

const jsonSchemaCache = new Map<string, Record<string, unknown>>();

function jsonSchemaFor(definition: DocumentTypeDefinition): Record<string, unknown> {
  let schema = jsonSchemaCache.get(definition.slug);
  if (!schema) {
    schema = toStrictJsonSchema(definition.schema);
    jsonSchemaCache.set(definition.slug, schema);
  }
  return schema;
}

function buildContent(pages: RenderedPage[]): LlmContentPart[] {
  const parts: LlmContentPart[] = [{ type: "text", text: `Document de ${pages.length} page(s).` }];

  const textHint = pages
    .filter((page) => page.text)
    .map((page) => `--- Page ${page.page_number} ---\n${page.text}`)
    .join("\n")
    .slice(0, MAX_TEXT_HINT_CHARS);
  if (textHint) {
    parts.push({ type: "text", text: `Texte embarqué du PDF (indice, l'image fait foi) :\n${textHint}` });
  }

  for (const page of pages) {
    parts.push({ type: "text", text: `Page ${page.page_number} :` });
    parts.push({ type: "image", data: page.image, mimeType: page.image_mime_type, detail: "high" });
  }
  return parts;
}

type ParseOutcome<T> = { ok: true; data: T } | { ok: false; issues: string };

function parseOutput<T extends z.ZodType>(schema: T, text: string): ParseOutcome<z.infer<T>> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, issues: "La réponse n'est pas un JSON valide." };
  }
  const result = schema.safeParse(json);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  // Chemins et messages uniquement : pas de valeur extraite dans le prompt de correction.
  const issues = result.error.issues
    .slice(0, 20)
    .map((issue) => `- ${issue.path.join(".") || "(racine)"} : ${issue.message}`)
    .join("\n");
  return { ok: false, issues };
}

export function createExtractor(llm: LlmClient, options: ExtractorOptions): Extractor {
  return async ({ document, content, type }) => {
    const definition = getDocumentTypeDefinition(type);
    if (!definition) {
      throw new PipelineError("EXTRACTION_NOT_SUPPORTED", `Extraction non disponible pour le type ${type}.`);
    }

    const pages = await renderDocument(content, document.mime_type as AllowedMimeType, { dpi: options.dpi });
    const baseContent = buildContent(pages);
    const system = `${EXTRACTION_SYSTEM_PROMPT}\n\n${definition.prompt}`;
    const responseSchema = { name: `extraction_${definition.slug}`, schema: jsonSchemaFor(definition) };
    const usage: LlmUsage[] = [];

    try {
      // Spec : un seul nouvel essai, avec les erreurs de validation dans le prompt, puis `failed`.
      let correction: string | null = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        const response = await llm.complete({
          purpose: "extract",
          system,
          content: correction ? [...baseContent, { type: "text", text: correction }] : baseContent,
          responseSchema,
          replayKey: `${document.sha256}:extract:${definition.slug}`,
        });
        usage.push(response.usage);

        const outcome = parseOutput(definition.schema, response.text);
        if (outcome.ok) {
          return { data: normalizeExtraction(outcome.data, pages.length), usage };
        }
        correction = `Ta réponse précédente ne respecte pas le schéma attendu :\n${outcome.issues}\nRenvoie une réponse complète et corrigée.`;
      }

      throw new PipelineError("EXTRACTION_INVALID", "Document illisible, merci de charger un scan plus net.");
    } catch (error) {
      if (error instanceof PipelineError) {
        error.usage = [...usage, ...error.usage];
      }
      throw error;
    }
  };
}

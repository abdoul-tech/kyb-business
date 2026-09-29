import PQueue from "p-queue";
import type { StoredDocumentRecord } from "../db/documents.js";
import { createClassifier } from "../documents/classifier.js";
import { createExtractor } from "../documents/extractor.js";
import { checkFile } from "../documents/file-check.js";
import { PipelineError } from "../documents/pipeline.js";
import { getDocumentTypeDefinition } from "../documents/types/index.js";
import type { LlmClient, LlmUsage } from "../llm/client.js";
import type { EvalDocument, EvalDossier } from "./dataset.js";
import { scoreField, type DocumentResult } from "./scoring.js";

export type EvalOptions = {
  llm: LlmClient;
  dpi: number;
  limits: { maxBytes: number; maxPages: number };
  concurrency?: number;
  onResult?: (result: DocumentResult) => void;
};

function sum(usage: LlmUsage[], key: "cost_usd" | "duration_ms"): number {
  return usage.reduce((total, u) => total + (u[key] ?? 0), 0);
}

function codeOf(error: unknown): string {
  return error instanceof PipelineError ? error.code : "PROCESSING_FAILED";
}

async function evaluateDocument(
  dossier: EvalDossier,
  doc: EvalDocument,
  classify: ReturnType<typeof createClassifier>,
  extract: ReturnType<typeof createExtractor>,
  limits: EvalOptions["limits"],
): Promise<DocumentResult> {
  const expectedType = doc.expected.type;
  const result: DocumentResult = {
    dossier: dossier.name,
    file: doc.file,
    expected_type: expectedType,
    classified_type: null,
    classification_confidence: null,
    extraction: "not_supported",
    error_code: null,
    fields: [],
    cost_usd: 0,
    duration_ms: 0,
  };
  const usage: LlmUsage[] = [];

  const checked = await checkFile(doc.content, doc.file, limits);
  const now = new Date();
  const record: StoredDocumentRecord = {
    _id: `eval:${dossier.name}/${doc.file}`,
    application_id: `eval:${dossier.name}`,
    original_filename: doc.file,
    mime_type: checked.mimeType,
    size_bytes: doc.content.length,
    storage_key: "",
    sha256: checked.sha256,
    page_count: checked.pageCount,
    type: null,
    type_confidence: null,
    type_confirmed_by_user: false,
    bridge_sections: [],
    status: "classifying",
    error_code: null,
    extracted_data_enc: null,
    llm_usage: [],
    uploaded_at: now,
    status_updated_at: now,
  };

  try {
    const classification = await classify({ document: record, content: doc.content });
    usage.push(...classification.usage);
    result.classified_type = classification.type;
    result.classification_confidence = classification.confidence;
  } catch (error) {
    result.error_code = codeOf(error);
    if (error instanceof PipelineError) {
      usage.push(...error.usage);
    }
  }

  // Extraction avec le type attendu (comme après confirmation par le client) : on mesure l'extraction
  // indépendamment des erreurs de classification, qui ont leur propre score.
  let data: unknown = null;
  if (getDocumentTypeDefinition(expectedType)) {
    try {
      const extraction = await extract({ document: { ...record, type: expectedType }, content: doc.content, type: expectedType });
      usage.push(...extraction.usage);
      data = extraction.data;
      result.extraction = "done";
    } catch (error) {
      result.extraction = "failed";
      result.error_code = codeOf(error);
      if (error instanceof PipelineError) {
        usage.push(...error.usage);
      }
    }
    // Une extraction échouée compte : ses champs attendus sont « missing ».
    result.fields = Object.entries(doc.expected.fields).map(([path, expected]) => scoreField(path, expected, data));
  }

  result.cost_usd = sum(usage, "cost_usd");
  result.duration_ms = sum(usage, "duration_ms");
  return result;
}

export async function runEval(dossiers: EvalDossier[], options: EvalOptions): Promise<DocumentResult[]> {
  const classify = createClassifier(options.llm);
  const extract = createExtractor(options.llm, { dpi: options.dpi });
  const queue = new PQueue({ concurrency: options.concurrency ?? 3 });

  const tasks = dossiers.flatMap((dossier) =>
    dossier.documents.map((doc) =>
      queue.add(async () => {
        const result = await evaluateDocument(dossier, doc, classify, extract, options.limits);
        options.onResult?.(result);
        return result;
      }),
    ),
  );

  // Ordre stable : celui des dossiers et des fichiers dans expected.json.
  return Promise.all(tasks);
}

import type { DocumentStatus, DocumentTypeSlug } from "@kyb/shared";
import type { DocumentPatch, StoredDocumentRecord } from "../db/documents.js";

// Sous ce seuil, ou si le type est `unknown`, le client confirme lui-même le type.
export const CLASSIFICATION_CONFIDENCE_THRESHOLD = 0.7;

// Statuts d'un document encore à traiter : relancés au démarrage de l'API.
export const PENDING_STATUSES: DocumentStatus[] = ["uploaded", "classifying", "extracting"];

export type DocumentStore = {
  findById(id: string): Promise<StoredDocumentRecord | null>;
  findByStatus(statuses: DocumentStatus[]): Promise<StoredDocumentRecord[]>;
  transition(id: string, from: DocumentStatus[], patch: DocumentPatch): Promise<StoredDocumentRecord | null>;
};

export type ClassificationResult = {
  type: DocumentTypeSlug;
  confidence: number;
};

export type Classifier = (input: { document: StoredDocumentRecord; content: Buffer }) => Promise<ClassificationResult>;

export type Extractor = (input: {
  document: StoredDocumentRecord;
  content: Buffer;
  type: DocumentTypeSlug;
}) => Promise<unknown>;

export type PipelineLogger = {
  info(event: string, data: Record<string, unknown>): void;
  error(event: string, data: Record<string, unknown>): void;
};

export type PipelineDeps = {
  store: DocumentStore;
  loadContent(document: StoredDocumentRecord): Promise<Buffer>;
  classify: Classifier;
  extract: Extractor;
  logger: PipelineLogger;
};

// Erreur métier du pipeline, avec un code stable exposé au client dans `error_code`.
export class PipelineError extends Error {
  readonly code: string;

  constructor(code: string, message = code) {
    super(message);
    this.name = "PipelineError";
    this.code = code;
  }
}

function errorCodeOf(error: unknown): string {
  return error instanceof PipelineError ? error.code : "PROCESSING_FAILED";
}

// Au démarrage : les documents restés en `uploaded`, `classifying` ou `extracting` (arrêt de l'API) sont relancés.
export async function resumePendingDocuments(
  store: DocumentStore,
  queue: { enqueue(documentId: string): void },
): Promise<number> {
  const pending = await store.findByStatus(PENDING_STATUSES);
  for (const document of pending) {
    queue.enqueue(document._id);
  }
  return pending.length;
}

// Traite un document là où il s'est arrêté : `uploaded`/`classifying` → classification, `extracting` → extraction.
// Chaque transition est conditionnelle : si le document est supprimé ou change d'état pendant le traitement,
// le pipeline s'arrête sans rien écraser.
export async function runDocumentPipeline(documentId: string, deps: PipelineDeps): Promise<void> {
  const { store, logger } = deps;
  let stage: "classifying" | "extracting" = "classifying";

  try {
    let document = await store.findById(documentId);
    if (!document || !PENDING_STATUSES.includes(document.status)) {
      return;
    }

    let content: Buffer | null = null;

    if (document.status === "uploaded" || document.status === "classifying") {
      document = await store.transition(documentId, ["uploaded", "classifying"], { status: "classifying" });
      if (!document) {
        return;
      }

      content = await deps.loadContent(document);
      const result = await deps.classify({ document, content });

      if (result.type === "unknown" || result.confidence < CLASSIFICATION_CONFIDENCE_THRESHOLD) {
        await store.transition(documentId, ["classifying"], {
          status: "needs_type_confirmation",
          type: result.type === "unknown" ? null : result.type,
          type_confidence: result.confidence,
        });
        logger.info("document.needs_type_confirmation", { document_id: documentId });
        return;
      }

      document = await store.transition(documentId, ["classifying"], {
        status: "extracting",
        type: result.type,
        type_confidence: result.confidence,
      });
      if (!document) {
        return;
      }
    }

    stage = "extracting";
    if (!document.type) {
      throw new PipelineError("TYPE_MISSING", "Document en extraction sans type.");
    }

    content ??= await deps.loadContent(document);
    const extracted = await deps.extract({ document, content, type: document.type });

    await store.transition(documentId, ["extracting"], {
      status: "extracted",
      extracted_data: extracted,
      error_code: null,
    });
    logger.info("document.extracted", { document_id: documentId, type: document.type });
  } catch (error) {
    const code = errorCodeOf(error);
    // Uniquement l'id, l'étape et le type d'erreur : le message peut contenir des données du document.
    logger.error("document.failed", {
      document_id: documentId,
      stage,
      error_code: code,
      error_name: (error as Error)?.name ?? "unknown",
    });
    await store
      .transition(documentId, ["classifying", "extracting"], { status: "failed", error_code: code })
      .catch(() => undefined);
  }
}

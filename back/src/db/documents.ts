import { randomUUID } from "node:crypto";
import {
  documentTypeCatalog,
  type BridgeSection,
  type DocumentStatus,
  type DocumentTypeSlug,
  type StoredDocument,
  type StoredDocumentDetail,
} from "@kyb/shared";
import { encryptionKey } from "../config/env.js";
import type { LlmUsage } from "../llm/client.js";
import { getDb } from "./client.js";
import { readExtractedData, toStoredPatch, type DocumentPatch } from "./document-patch.js";

export type { DocumentPatch } from "./document-patch.js";

export type StoredDocumentRecord = {
  _id: string;
  application_id: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  storage_key: string;
  sha256: string;
  page_count: number | null;
  type: DocumentTypeSlug | null;
  type_confidence: number | null;
  type_confirmed_by_user: boolean;
  bridge_sections: BridgeSection[];
  status: DocumentStatus;
  error_code: string | null;
  // Sortie de l'extraction (validée Zod, normalisée), chiffrée AES-256-GCM en base64. Lire via readExtractedData.
  extracted_data_enc: string | null;
  // Tokens, coût et durée de chaque appel LLM fait pour ce document (spec : `llm_usage`).
  llm_usage: LlmUsage[];
  uploaded_at: Date;
  status_updated_at: Date;
};

const COLLECTION = "documents";

function collection() {
  return getDb().collection<StoredDocumentRecord>(COLLECTION);
}

export async function ensureDocumentIndexes(): Promise<void> {
  // Un même fichier (même hash) n'existe qu'une fois par dossier, y compris en cas d'uploads concurrents.
  await collection().createIndex({ application_id: 1, sha256: 1 }, { unique: true });
}

export function newDocumentId(): string {
  return `doc_${randomUUID()}`;
}

export async function createStoredDocument(input: {
  id: string;
  applicationId: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  sha256: string;
  pageCount: number;
}): Promise<StoredDocumentRecord> {
  const now = new Date();
  const record: StoredDocumentRecord = {
    _id: input.id,
    application_id: input.applicationId,
    original_filename: input.originalFilename,
    mime_type: input.mimeType,
    size_bytes: input.sizeBytes,
    storage_key: input.storageKey,
    sha256: input.sha256,
    page_count: input.pageCount,
    type: null,
    type_confidence: null,
    type_confirmed_by_user: false,
    bridge_sections: [],
    status: "uploaded",
    error_code: null,
    extracted_data_enc: null,
    llm_usage: [],
    uploaded_at: now,
    status_updated_at: now,
  };

  await collection().insertOne(record);
  return record;
}

export async function findDocumentBySha256(
  applicationId: string,
  sha256: string,
): Promise<StoredDocumentRecord | null> {
  return collection().findOne({ application_id: applicationId, sha256 });
}

export function isDuplicateKeyError(error: unknown): boolean {
  return (error as { code?: number }).code === 11000;
}

// Implémentation Mongo du stockage utilisé par le pipeline (voir documents/pipeline.ts).
export const mongoDocumentStore = {
  findById(id: string): Promise<StoredDocumentRecord | null> {
    return collection().findOne({ _id: id });
  },

  findByStatus(statuses: DocumentStatus[]): Promise<StoredDocumentRecord[]> {
    return collection().find({ status: { $in: statuses } }).sort({ uploaded_at: 1 }).toArray();
  },

  // Mise à jour conditionnelle : ne s'applique que si le document est encore dans l'un des statuts attendus.
  // Renvoie null si le document a été supprimé ou a changé d'état entre-temps.
  transition(id: string, from: DocumentStatus[], patch: DocumentPatch): Promise<StoredDocumentRecord | null> {
    return collection().findOneAndUpdate(
      { _id: id, status: { $in: from } },
      { $set: { ...toStoredPatch(patch, encryptionKey), status_updated_at: new Date() } },
      { returnDocument: "after" },
    );
  },
};

// Le client confirme ou corrige le type : l'extraction est relancée avec ce type, sans reclassification.
// Refusé (null) si le document est en cours de traitement, pour ne jamais mélanger deux extractions.
export async function confirmDocumentType(
  applicationId: string,
  documentId: string,
  type: Exclude<DocumentTypeSlug, "unknown">,
): Promise<StoredDocumentRecord | null> {
  return collection().findOneAndUpdate(
    {
      _id: documentId,
      application_id: applicationId,
      status: { $in: ["needs_type_confirmation", "extracted", "failed"] satisfies DocumentStatus[] },
    },
    {
      $set: {
        ...toStoredPatch(
          {
            status: "extracting",
            type,
            type_confidence: 1,
            type_confirmed_by_user: true,
            bridge_sections: documentTypeCatalog[type].bridge_sections,
            error_code: null,
            extracted_data: null,
          },
          encryptionKey,
        ),
        status_updated_at: new Date(),
      },
    },
    { returnDocument: "after" },
  );
}

export async function findDocumentsByApplication(applicationId: string): Promise<StoredDocumentRecord[]> {
  return collection().find({ application_id: applicationId }).sort({ uploaded_at: 1 }).toArray();
}

export async function findDocumentById(
  applicationId: string,
  documentId: string,
): Promise<StoredDocumentRecord | null> {
  return collection().findOne({ _id: documentId, application_id: applicationId });
}

export async function deleteDocument(
  applicationId: string,
  documentId: string,
): Promise<StoredDocumentRecord | null> {
  const document = await findDocumentById(applicationId, documentId);
  if (!document) {
    return null;
  }

  await collection().deleteOne({ _id: documentId });
  return document;
}

export function toPublicDocument(doc: StoredDocumentRecord): StoredDocument {
  return {
    id: doc._id,
    application_id: doc.application_id,
    original_filename: doc.original_filename,
    mime_type: doc.mime_type,
    size_bytes: doc.size_bytes,
    page_count: doc.page_count,
    type: doc.type,
    type_confidence: doc.type_confidence,
    type_confirmed_by_user: doc.type_confirmed_by_user,
    bridge_sections: doc.bridge_sections,
    status: doc.status,
    error_code: doc.error_code,
    uploaded_at: doc.uploaded_at.toISOString(),
  };
}

// Détail d'un document, avec ses champs extraits déchiffrés (GET /documents/:docId uniquement).
export function toPublicDocumentDetail(doc: StoredDocumentRecord): StoredDocumentDetail {
  return { ...toPublicDocument(doc), extracted_data: readExtractedData(doc, encryptionKey) };
}

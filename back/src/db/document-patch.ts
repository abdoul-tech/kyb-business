import type { StoredDocumentRecord } from "./documents.js";
import { decryptJson, encryptJson } from "../documents/encryption.js";

// Modification d'un document vue par le pipeline : `extracted_data` y est en clair, chiffré à l'écriture.
export type DocumentPatch = Partial<
  Pick<
    StoredDocumentRecord,
    "status" | "type" | "type_confidence" | "type_confirmed_by_user" | "bridge_sections" | "error_code" | "llm_usage"
  >
> & { extracted_data?: unknown };

export type StoredPatch = Omit<DocumentPatch, "extracted_data"> & { extracted_data_enc?: string | null };

export function toStoredPatch(patch: DocumentPatch, key: Buffer): StoredPatch {
  const { extracted_data, ...rest } = patch;
  if (extracted_data === undefined) {
    return rest;
  }
  return { ...rest, extracted_data_enc: extracted_data === null ? null : encryptJson(extracted_data, key) };
}

export function readExtractedData(record: Pick<StoredDocumentRecord, "extracted_data_enc">, key: Buffer): unknown {
  return record.extracted_data_enc ? decryptJson(record.extracted_data_enc, key) : null;
}

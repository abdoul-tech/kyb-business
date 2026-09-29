import { randomBytes } from "node:crypto";
import type { DocumentStatus } from "@kyb/shared";
import { readExtractedData, toStoredPatch, type DocumentPatch } from "../../src/db/document-patch.js";
import type { StoredDocumentRecord } from "../../src/db/documents.js";
import type { DocumentStore } from "../../src/documents/pipeline.js";

export function makeRecord(overrides: Partial<StoredDocumentRecord> = {}): StoredDocumentRecord {
  const now = new Date();
  return {
    _id: "doc_1",
    application_id: "app_1",
    original_filename: "rccm.pdf",
    mime_type: "application/pdf",
    size_bytes: 100,
    storage_key: "applications/app_1/doc_1",
    sha256: "hash",
    page_count: 1,
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
    ...overrides,
  };
}

// Stockage en mémoire, même sémantique que mongoDocumentStore (transitions conditionnelles, extraction chiffrée).
export class MemoryDocumentStore implements DocumentStore {
  readonly key = randomBytes(32);
  readonly documents = new Map<string, StoredDocumentRecord>();
  readonly history: DocumentStatus[] = [];

  constructor(records: StoredDocumentRecord[] = []) {
    for (const record of records) {
      this.documents.set(record._id, record);
    }
  }

  async findById(id: string) {
    return this.documents.get(id) ?? null;
  }

  async findByStatus(statuses: DocumentStatus[]) {
    return [...this.documents.values()].filter((doc) => statuses.includes(doc.status));
  }

  async transition(id: string, from: DocumentStatus[], patch: DocumentPatch) {
    const current = this.documents.get(id);
    if (!current || !from.includes(current.status)) {
      return null;
    }
    const updated = { ...current, ...toStoredPatch(patch, this.key), status_updated_at: new Date() };
    this.documents.set(id, updated);
    if (patch.status) {
      this.history.push(patch.status);
    }
    return updated;
  }

  extractedData(id: string): unknown {
    const record = this.documents.get(id);
    return record ? readExtractedData(record, this.key) : null;
  }
}

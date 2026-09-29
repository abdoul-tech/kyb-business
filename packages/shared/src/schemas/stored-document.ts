import { z } from "zod";
import { DocumentTypeSlugSchema } from "./document-type.js";
import { BridgeSectionSchema } from "./bridge-section.js";
import { DocumentStatusSchema } from "./document-status.js";

export const StoredDocumentSchema = z.object({
  id: z.string(),
  application_id: z.string(),
  original_filename: z.string(),
  mime_type: z.string(),
  size_bytes: z.number().int().nonnegative(),
  page_count: z.number().int().nonnegative().nullable(),
  type: DocumentTypeSlugSchema.nullable(),
  type_confidence: z.number().min(0).max(1).nullable(),
  type_confirmed_by_user: z.boolean(),
  bridge_sections: z.array(BridgeSectionSchema),
  status: DocumentStatusSchema,
  error_code: z.string().nullable(),
  uploaded_at: z.iso.datetime(),
});

export type StoredDocument = z.infer<typeof StoredDocumentSchema>;

// Réponse de GET /applications/{id}/documents/{docId} : statut + champs extraits (null tant que non extrait).
// La forme de `extracted_data` dépend de `type` (RccmSchema, StatutsSchema, IdDocumentSchema…).
export const StoredDocumentDetailSchema = StoredDocumentSchema.extend({
  extracted_data: z.unknown().nullable(),
});

export type StoredDocumentDetail = z.infer<typeof StoredDocumentDetailSchema>;

// Corps de PATCH /applications/{id}/documents/{docId} : le client confirme ou corrige le type.
export const ConfirmDocumentTypeRequestSchema = z.strictObject({
  type: DocumentTypeSlugSchema.exclude(["unknown"]),
});

export type ConfirmDocumentTypeRequest = z.infer<typeof ConfirmDocumentTypeRequestSchema>;

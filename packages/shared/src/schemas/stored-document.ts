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

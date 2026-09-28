import { z } from "zod";

export const documentTypeSlugValues = [
  "statuts",
  "rccm",
  "rccm_modificatif",
  "tax_certificate",
  "ownership_document",
  "id_document",
  "good_standing",
  "proof_of_address",
  "business_activity",
  "license",
  "logistics_document",
  "unknown",
] as const;

export const DocumentTypeSlugSchema = z.enum(documentTypeSlugValues);

export type DocumentTypeSlug = z.infer<typeof DocumentTypeSlugSchema>;

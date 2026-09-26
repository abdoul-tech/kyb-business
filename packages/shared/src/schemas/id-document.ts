import { z } from "zod";
import { extractedField } from "./extracted-field.js";

export const IdDocumentSchema = z.strictObject({
  first_name: extractedField(z.string()),
  last_name: extractedField(z.string()),
  middle_names: extractedField(z.string()),
  date_of_birth: extractedField(z.string()),
  nationality: extractedField(z.string()),
  address: extractedField(z.string()),
  expiry_date: extractedField(z.string()),
  document_type: extractedField(
    z.enum(["CNI", "CIP", "NPI-fID", "Passeport"]),
  ),
  document_number: extractedField(z.string()),
  issuing_authority: extractedField(z.string()),
  npi: extractedField(z.string()),
});

export type IdDocument = z.infer<typeof IdDocumentSchema>;
import { z } from "zod";
import { extractedField } from "./extracted-field.js";

export const LicenseSchema = z.strictObject({
  document_type: extractedField(
    z.enum(["license", "permit", "importer_card", "approval", "other"]),
  ),
  issuing_authority: extractedField(z.string()),
  license_type: extractedField(z.string()),
  license_number: extractedField(z.string()),
  holder_name: extractedField(z.string()),
  authorized_activity: extractedField(z.string()),
  issue_date: extractedField(z.string()),
  expiry_date: extractedField(z.string()),
  validity_period: extractedField(z.string()),
});

export type License = z.infer<typeof LicenseSchema>;
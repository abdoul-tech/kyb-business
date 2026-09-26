import { z } from "zod";
import { extractedField } from "./extracted-field.js";

const DocumentTypeSchema = z.enum([
  "tax_clearance",
  "tax_compliance",
  "non_bankruptcy",
  "other",
]);

const TaxpayerTypeSchema = z.enum(["individual", "legal_entity"]);

const FiscalStatusSchema = z.enum([
  "compliant",
  "non_compliant",
  "unknown",
]);

export const GoodStandingSchema = z.strictObject({
  document: z.strictObject({
    type: extractedField(DocumentTypeSchema),
    certificate_number: extractedField(z.string()),
    issue_date: extractedField(z.string()),
    validity_period: extractedField(z.string()),
  }),
  taxpayer: z.strictObject({
    tax_id: extractedField(z.string()),
    legal_name: extractedField(z.string()),
    taxpayer_type: extractedField(TaxpayerTypeSchema),
  }),
  fiscal_status: z.strictObject({
    status: extractedField(FiscalStatusSchema),
    covered_period: extractedField(z.string()),
  }),
  authority: z.strictObject({
    issuing_authority: extractedField(z.string()),
    signatory: extractedField(z.string()),
    signature_present: extractedField(z.boolean()),
  }),
});

export type GoodStanding = z.infer<typeof GoodStandingSchema>;
import { z } from "zod";
import { extractedField } from "./extracted-field.js";
import { RegisteredAddressSchema } from "./registered-address.js";

export const ProofOfAddressSchema = z.strictObject({
  document_type: extractedField(
    z.enum(["utility_bill", "bank_statement", "commercial_lease", "other"]),
  ),
  name_on_document: extractedField(z.string()),
  address: extractedField(RegisteredAddressSchema),
  document_date: extractedField(z.string()),
});

export type ProofOfAddress = z.infer<typeof ProofOfAddressSchema>;
import { z } from "zod";
import { extractedField } from "./extracted-field.js";
import { RegisteredAddressSchema } from "./registered-address.js";

export const TaxCertificateSchema = z.strictObject({
  tax_id: extractedField(z.string()),
  legal_name: extractedField(z.string()),
  registered_address: extractedField(RegisteredAddressSchema),
});

export type TaxCertificate = z.infer<typeof TaxCertificateSchema>;
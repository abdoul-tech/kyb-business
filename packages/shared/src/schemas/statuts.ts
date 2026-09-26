import { z } from "zod";
import { extractedField } from "./extracted-field.js";
import { OfficerSchema } from "./officer.js";
import { RegisteredAddressSchema } from "./registered-address.js";
import { ShareholderSchema } from "./shareholder.js";

export const StatutsSchema = z.strictObject({
  legal_name: extractedField(z.string()),
  legal_form_explicit: extractedField(z.string()),
  legal_form_other: extractedField(z.string()),
  registered_address: extractedField(RegisteredAddressSchema),
  object: extractedField(z.string()),
  capital_amount: extractedField(z.number().int().nonnegative()),
  capital_currency: extractedField(z.string()),
  capital_cash_amount: extractedField(z.number().int().nonnegative()),
  capital_in_kind_amount: extractedField(z.number().int().nonnegative()),
  shareholders: z.array(ShareholderSchema),
  officers: z.array(OfficerSchema),
});

export type Statuts = z.infer<typeof StatutsSchema>;
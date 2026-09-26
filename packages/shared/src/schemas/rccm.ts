import { z } from "zod";
import { extractedField } from "./extracted-field.js";
import { OfficerSchema } from "./officer.js";
import { RegisteredAddressSchema } from "./registered-address.js";

export const RccmSchema = z.strictObject({
  legal_name: extractedField(z.string()),
  trade_name: extractedField(z.string()),
  acronym: extractedField(z.string()),
  legal_form_explicit: extractedField(z.string()),
  legal_form_other: extractedField(z.string()),
  object: extractedField(z.string()),
  activity_start_date: extractedField(z.string()),
  rccm_number: extractedField(z.string()),
  registration_date: extractedField(z.string()),
  country: extractedField(z.string()),
  registered_address: extractedField(RegisteredAddressSchema),
  activity: extractedField(z.string()),
  secondary_activities: extractedField(z.array(z.string())),
  capital_amount: extractedField(z.number().int().nonnegative()),
  capital_currency: extractedField(z.string()),
  capital_cash_amount: extractedField(z.number().int().nonnegative()),
  capital_in_kind_amount: extractedField(z.number().int().nonnegative()),
  officers: z.array(OfficerSchema),
});

export type Rccm = z.infer<typeof RccmSchema>;
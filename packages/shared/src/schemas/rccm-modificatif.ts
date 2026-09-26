import { z } from "zod";
import { extractedField } from "./extracted-field.js";
import { OfficerSchema } from "./officer.js";
import { RegisteredAddressSchema } from "./registered-address.js";

const EffectiveRegisteredAddressChangeSchema = z.strictObject({
  old_value: extractedField(RegisteredAddressSchema),
  old_effective_date: extractedField(z.string()),
  new_value: extractedField(RegisteredAddressSchema),
  new_effective_date: extractedField(z.string()),
});

const EffectiveLegalFormChangeSchema = z.strictObject({
  old_value: extractedField(z.string()),
  old_effective_date: extractedField(z.string()),
  new_value: extractedField(z.string()),
  new_effective_date: extractedField(z.string()),
});

const CapitalValueSchema = z.strictObject({
  amount: z.number().int().nonnegative(),
  currency: z.string(),
});

const EffectiveCapitalChangeSchema = z.strictObject({
  old_value: extractedField(CapitalValueSchema),
  old_effective_date: extractedField(z.string()),
  new_value: extractedField(CapitalValueSchema),
  new_effective_date: extractedField(z.string()),
});

const DenominationChangeSchema = z.strictObject({
  old_value: extractedField(z.string()),
  new_value: extractedField(z.string()),
});

const DirectorChangeSchema = z.strictObject({
  change_type: extractedField(z.enum(["added", "modified", "removed"])),
  old_value: OfficerSchema.nullable(),
  new_value: OfficerSchema.nullable(),
  effective_date: extractedField(z.string()),
});

export const RccmModificatifSchema = z.strictObject({
  rccm_number: extractedField(z.string()),
  modification_type: extractedField(
    z.enum([
      "characteristics",
      "activities",
      "directors",
      "registered_office_transfer",
      "establishment_closure",
      "dissolution",
      "other",
    ]),
  ),
  modification_type_other: extractedField(z.string()),
  registered_address_change: EffectiveRegisteredAddressChangeSchema,
  legal_form_change: EffectiveLegalFormChangeSchema,
  capital_change: EffectiveCapitalChangeSchema,
  activities_added: z.array(extractedField(z.string())),
  activities_removed: z.array(extractedField(z.string())),
  denomination_change: DenominationChangeSchema,
  directors_changes: z.array(DirectorChangeSchema),
  modification_date: extractedField(z.string()),
  supporting_evidence_reference: extractedField(z.string()),
});

export type RccmModificatif = z.infer<typeof RccmModificatifSchema>;
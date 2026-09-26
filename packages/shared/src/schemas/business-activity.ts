import { z } from "zod";
import { extractedField } from "./extracted-field.js";
import { RegisteredAddressSchema } from "./registered-address.js";

const CompanyRoleSchema = z.enum([
  "supplier",
  "service_provider",
  "seller",
  "subcontractor",
  "customer",
  "buyer",
  "other",
]);

const PartySchema = z.strictObject({
  name: extractedField(z.string()),
  legal_form: extractedField(z.string()),
  tax_id: extractedField(z.string()),
  rccm_number: extractedField(z.string()),
  address: extractedField(RegisteredAddressSchema),
});

const InvoiceItemSchema = z.strictObject({
  description: extractedField(z.string()),
  quantity: extractedField(z.number().nonnegative()),
  unit_price: extractedField(z.number().int().nonnegative()),
  total_price: extractedField(z.number().int().nonnegative()),
  unit: extractedField(z.string()),
});

const OtherTaxSchema = z.strictObject({
  name: extractedField(z.string()),
  amount: extractedField(z.number().int().nonnegative()),
});

const InvoiceSchema = z.strictObject({
  document: z.strictObject({
    number: extractedField(z.string()),
    date: extractedField(z.string()),
    type: extractedField(z.enum(["sale", "credit_note", "other"])),
    currency: extractedField(z.string()),
  }),
  issuer: PartySchema,
  customer: PartySchema,
  items: z.array(InvoiceItemSchema),
  amounts: z.strictObject({
    subtotal: extractedField(z.number().int().nonnegative()),
    vat_rate: extractedField(z.number().min(0).max(100)),
    vat_amount: extractedField(z.number().int().nonnegative()),
    other_taxes: z.array(OtherTaxSchema),
    total: extractedField(z.number().int().nonnegative()),
  }),
  fiscal: z.strictObject({
    mecef_number: extractedField(z.string()),
    electronic_signature: extractedField(z.string()),
    electronic_code: extractedField(z.string()),
  }),
});

const ContractPartySchema = z.strictObject({
  ...PartySchema.shape,
  role: extractedField(CompanyRoleSchema),
  role_other: extractedField(z.string()),
});

const ContractSchema = z.strictObject({
  document: z.strictObject({
    number: extractedField(z.string()),
    contract_type: extractedField(z.string()),
    signature_date: extractedField(z.string()),
    effective_date: extractedField(z.string()),
  }),
  parties: z.array(ContractPartySchema),
  service: z.strictObject({
    description: extractedField(z.string()),
    category: extractedField(z.string()),
    deliverables: z.array(extractedField(z.string())),
    location: extractedField(z.string()),
  }),
  financial: z.strictObject({
    amount: extractedField(z.number().int().nonnegative()),
    currency: extractedField(z.string()),
    payment_terms: extractedField(z.string()),
    payment_schedule: extractedField(z.string()),
  }),
  duration: z.strictObject({
    start_date: extractedField(z.string()),
    end_date: extractedField(z.string()),
    duration: extractedField(z.string()),
  }),
  signatures: z.strictObject({
    signed: extractedField(z.boolean()),
    signatories: z.array(extractedField(z.string())),
  }),
});

const BusinessActivityEvidenceSchema = z.union([
  z.strictObject({ type: z.literal("invoice"), invoice: InvoiceSchema }),
  z.strictObject({ type: z.literal("contract"), contract: ContractSchema }),
]);

export const BusinessActivitySchema = z.strictObject({
  activity: z.strictObject({
    category: extractedField(z.string()),
    description: extractedField(z.string()),
    role: extractedField(CompanyRoleSchema),
    role_other: extractedField(z.string()),
  }),
  evidence: BusinessActivityEvidenceSchema,
});

export type BusinessActivity = z.infer<typeof BusinessActivitySchema>;
import { z } from "zod";
import { isIsoDate } from "../normalize/dates.js";
import { ApplicationSchema } from "./application.js";
import { BridgeEntityTypeSchema, BridgeRevenueBandSchema, BridgeSourceOfFundsSchema } from "./bridge-values.js";
import { field, type Field } from "./field.js";
import { RegisteredAddressSchema } from "./registered-address.js";
import { StoredDocumentSchema } from "./stored-document.js";

const isoDate = z.string().refine(isIsoDate, { message: "Date attendue au format AAAA-MM-JJ." });
const text = z.string().trim().min(1).max(2000);

export const AddressSchema = RegisteredAddressSchema;
export type Address = z.infer<typeof AddressSchema>;

export const ShareCapitalSchema = z.strictObject({
  amount: z.number().int().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/, { message: "Devise ISO 4217 attendue (XOF, XAF…)." }),
});
export type ShareCapital = z.infer<typeof ShareCapitalSchema>;

// Valeur de chaque champ « business » du dossier (spec, « Modèle de données »).
export const businessFieldSchemas = {
  // Alimentés par les documents (fusion), corrigeables par le client.
  legal_name: text,
  entity_type: BridgeEntityTypeSchema,
  legal_form_local: text,
  incorporation_date: isoDate,
  registration_number: text,
  tax_id: text,
  country: z.string().regex(/^[A-Z]{3}$/, { message: "Code pays ISO alpha-3 attendu (SEN, NER…)." }),
  registered_address: AddressSchema,
  activity: text,
  share_capital: ShareCapitalSchema,
  // Jamais dans les documents : toujours demandés au client (spec, « Champs à compléter par le client »).
  operating_address: AddressSchema,
  email: z.email({ message: "Adresse email invalide." }),
  phone: z.string().trim().min(6).max(30),
  website: z.url({ protocol: /^https?$/, message: "URL attendue (https://…)." }),
  no_website_explanation: text,
  description: text,
  naics: z.string().regex(/^\d{2,6}$/, { message: "Code NAICS attendu (2 à 6 chiffres)." }),
  source_of_funds: BridgeSourceOfFundsSchema,
  annual_revenue: BridgeRevenueBandSchema,
  monthly_volume_usd: z.number().nonnegative(),
  money_transmission: z.boolean(),
  money_transmission_program: text,
  account_purpose: text,
  dao: z.boolean(),
} as const;

export type BusinessFieldKey = keyof typeof businessFieldSchemas;
export type BusinessValues = { [K in BusinessFieldKey]: z.infer<(typeof businessFieldSchemas)[K]> };

export const businessFieldKeys = Object.keys(businessFieldSchemas) as BusinessFieldKey[];

// Champs issus de la fusion des documents ; les autres ne sont renseignés que par le client.
export const extractedBusinessFieldKeys = [
  "legal_name",
  "entity_type",
  "legal_form_local",
  "incorporation_date",
  "registration_number",
  "tax_id",
  "country",
  "registered_address",
  "activity",
  "share_capital",
] as const satisfies readonly BusinessFieldKey[];

function mapFields<R>(build: (schema: z.ZodType) => R): { [K in BusinessFieldKey]: R } {
  return Object.fromEntries(Object.entries(businessFieldSchemas).map(([key, schema]) => [key, build(schema)])) as {
    [K in BusinessFieldKey]: R;
  };
}

export type BusinessView = { [K in BusinessFieldKey]: Field<BusinessValues[K]> };
export const BusinessViewSchema = z.strictObject(mapFields((schema) => field(schema))) as unknown as z.ZodType<BusinessView>;

export const UboViewSchema = z.strictObject({
  id: z.string(),
  full_name: field(z.string()),
  role: field(z.string()),
  ownership_pct: field(z.number().min(0).max(100)),
  // ≥ 25 % de détention.
  is_ubo: z.boolean(),
  // Rôle de direction (gérant, PDG, DG, PCA…).
  is_control_person: z.boolean(),
  attests_ownership: z.boolean(),
  dob: field(isoDate),
  nationality: field(z.string()),
  address: field(z.string()),
  id_document_id: z.string().nullable(),
  id_expiry: field(isoDate),
  // Documents dont provient la personne (statuts, RCCM, pièce d'identité).
  source_doc_ids: z.array(z.string()),
});
export type UboView = z.infer<typeof UboViewSchema>;

export const mergeAlertCodeValues = ["field_conflict", "ubo_possible_duplicate"] as const;

// Alertes produites par la fusion ; le moteur de règles complet (J4) en produira d'autres.
export const MergeAlertSchema = z.strictObject({
  code: z.enum(mergeAlertCodeValues),
  severity: z.literal("warning"),
  message_fr: z.string(),
  subject: z.strictObject({
    field: z.string().optional(),
    ubo_ids: z.array(z.string()).optional(),
  }),
});
export type MergeAlert = z.infer<typeof MergeAlertSchema>;

// Réponse de GET /applications/{id} : dossier fusionné.
export const ApplicationViewSchema = ApplicationSchema.extend({
  business: BusinessViewSchema,
  ubos: z.array(UboViewSchema),
  alerts: z.array(MergeAlertSchema),
  documents: z.array(StoredDocumentSchema),
  processing_documents: z.number().int().nonnegative(),
});
export type ApplicationView = z.infer<typeof ApplicationViewSchema>;

// Corps de PATCH /applications/{id} (autosave) : valeurs brutes. null = le client vide le champ.
// Toute valeur envoyée est marquée `edited_by_user` et n'est plus jamais écrasée par une extraction.
export type ApplicationPatch = {
  business?: { [K in BusinessFieldKey]?: BusinessValues[K] | null };
};
export const ApplicationPatchSchema: z.ZodType<ApplicationPatch> = z.strictObject({
  business: z.strictObject(mapFields((schema) => schema.nullable().optional())).optional(),
}) as z.ZodType<ApplicationPatch>;

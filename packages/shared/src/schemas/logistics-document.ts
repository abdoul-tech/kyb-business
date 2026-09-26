import { z } from "zod";
import { extractedField } from "./extracted-field.js";
import { RegisteredAddressSchema } from "./registered-address.js";

const PartySchema = z.strictObject({
  name: extractedField(z.string()),
  role: extractedField(z.string()),
  address: extractedField(RegisteredAddressSchema),
});

const AddressSchema = z.strictObject({
  purpose: extractedField(z.string()),
  address: extractedField(RegisteredAddressSchema),
});

const DocumentDateSchema = z.strictObject({
  event: extractedField(z.string()),
  date: extractedField(z.string()),
});

const GoodSchema = z.strictObject({
  description: extractedField(z.string()),
  quantity: extractedField(z.number().nonnegative()),
  unit: extractedField(z.string()),
});

export const LogisticsDocumentSchema = z.strictObject({
  document_type: extractedField(
    z.enum([
      "warehouse_lease",
      "bill_of_lading",
      "supplier_contract",
      "logistics_contract",
      "other",
    ]),
  ),
  document_number: extractedField(z.string()),
  document_date: extractedField(z.string()),
  parties: z.array(PartySchema),
  addresses: z.array(AddressSchema),
  dates: z.array(DocumentDateSchema),
  goods: z.array(GoodSchema),
});

export type LogisticsDocument = z.infer<typeof LogisticsDocumentSchema>;
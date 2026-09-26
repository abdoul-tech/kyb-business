import { z } from "zod";
import { extractedField } from "./extracted-field.js";

export const ShareholderSchema = z.strictObject({
  holder_type: extractedField(z.enum(["individual", "legal_entity"])),
  first_name: extractedField(z.string()),
  last_name: extractedField(z.string()),
  legal_entity_name: extractedField(z.string()),
  shares_count: extractedField(z.number().int().nonnegative()),
  ownership_pct: extractedField(z.number().min(0).max(100)),
});
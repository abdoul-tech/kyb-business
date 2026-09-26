import { z } from "zod";
import { extractedField } from "./extracted-field.js";

export const OfficerSchema = z.strictObject({
  first_name: extractedField(z.string()),
  last_name: extractedField(z.string()),
  role: extractedField(z.string()),
  nationality: extractedField(z.string()),
  address: extractedField(z.string()),
  date_of_birth: extractedField(z.string()),
  place_of_birth: extractedField(z.string()),
});
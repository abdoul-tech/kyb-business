import { z } from "zod";

export const documentStatusValues = [
  "uploaded",
  "classifying",
  "extracting",
  "extracted",
  "needs_type_confirmation",
  "failed",
] as const;

export const DocumentStatusSchema = z.enum(documentStatusValues);

export type DocumentStatus = z.infer<typeof DocumentStatusSchema>;

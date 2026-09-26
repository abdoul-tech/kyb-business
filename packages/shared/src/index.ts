import { z } from "zod";

export const extractedField = <T extends z.ZodType>(valueSchema: T) =>
  z.object({
    value: valueSchema.nullable(),
    confidence: z.number().min(0).max(1),
    source_page: z.number().int().min(1).nullable(),
  });

export type ExtractedField<T> = {
  value: T | null;
  confidence: number;
  source_page: number | null;
};
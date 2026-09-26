import { z } from "zod";

export const extractedField = <T extends z.ZodType>(valueSchema: T) =>
  z.strictObject({
    value: valueSchema.nullable(),
    confidence: z.number().min(0).max(1),
    source_page: z.number().int().min(1).nullable(),
  });

export type ExtractedField<T> = z.infer<
  ReturnType<typeof extractedField<z.ZodType<T>>>
>;
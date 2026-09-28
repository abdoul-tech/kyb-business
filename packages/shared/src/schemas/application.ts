import { z } from "zod";
import { ApplicationStatusSchema } from "./application-status.js";

export const ApplicationSchema = z.object({
  id: z.string(),
  status: ApplicationStatusSchema,
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
  submitted_at: z.iso.datetime().nullable(),
});

export type Application = z.infer<typeof ApplicationSchema>;

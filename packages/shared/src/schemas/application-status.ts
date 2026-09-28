import { z } from "zod";

export const applicationStatusValues = ["draft", "ready", "submitted"] as const;

export const ApplicationStatusSchema = z.enum(applicationStatusValues);

export type ApplicationStatus = z.infer<typeof ApplicationStatusSchema>;

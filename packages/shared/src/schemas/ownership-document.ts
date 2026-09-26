import { z } from "zod";
import { ShareholderSchema } from "./shareholder.js";

export const OwnershipDocumentSchema = z.strictObject({
  shareholders: z.array(ShareholderSchema),
});

export type OwnershipDocument = z.infer<typeof OwnershipDocumentSchema>;
import { z } from "zod";

export const bridgeSectionValues = [
  "formation",
  "ownership",
  "ubo",
  "good_standing",
  "proof_of_address",
  "business_activity",
  "licensure",
  "additional",
] as const;

export const BridgeSectionSchema = z.enum(bridgeSectionValues);

export type BridgeSection = z.infer<typeof BridgeSectionSchema>;

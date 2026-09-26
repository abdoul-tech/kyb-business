import { z } from "zod";

export const RegisteredAddressSchema = z.strictObject({
  full_address: z.string(),
  raw_components: z
    .array(
      z.strictObject({
        label: z.string(),
        value: z.string(),
      }),
    )
    .nullable(),
});
import { ApiError } from "./errors.js";

export function requireParam(value: string | string[] | undefined, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ApiError("VALIDATION_ERROR", `Paramètre ${name} invalide.`);
  }

  return value;
}

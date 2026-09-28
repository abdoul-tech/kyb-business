import { z } from "zod";

type JsonSchema = Record<string, unknown>;

// Mots-clés retirés : les bornes sont revalidées par Zod à la réception, et le mode strict d'OpenAI
// n'accepte qu'un sous-ensemble de JSON Schema.
const DROPPED_KEYWORDS = new Set(["$schema", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum"]);

function sanitize(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(sanitize);
  }
  if (!node || typeof node !== "object") {
    return node;
  }

  const result: JsonSchema = {};
  for (const [key, value] of Object.entries(node)) {
    if (!DROPPED_KEYWORDS.has(key)) {
      result[key] = sanitize(value);
    }
  }

  // Mode strict : tout objet est fermé et tous ses champs sont obligatoires (un champ absent vaut null).
  if (result.type === "object" && result.properties && typeof result.properties === "object") {
    result.required = Object.keys(result.properties);
    result.additionalProperties = false;
  }
  return result;
}

// Schéma JSON compatible Structured Outputs (`strict: true`) généré depuis un schéma Zod.
export function toStrictJsonSchema(schema: z.ZodType): JsonSchema {
  return sanitize(z.toJSONSchema(schema, { target: "draft-7" })) as JsonSchema;
}

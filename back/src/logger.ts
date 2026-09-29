import pino, { type DestinationStream, type Logger } from "pino";

// Spec : aucune donnée d'identité dans les logs. On ne logge volontairement que des identifiants
// (application_id, document_id), types, statuts, codes d'erreur et durées. La liste ci-dessous est un
// filet de sécurité si une donnée sensible se retrouve malgré tout dans un objet loggé.
const SENSITIVE_KEYS = [
  "authorization",
  "access_token",
  "token",
  "extracted_data",
  "extracted_data_enc",
  "text",
  "value",
  "candidates",
  "original_filename",
  "legal_name",
  "trade_name",
  "first_name",
  "last_name",
  "middle_names",
  "full_name",
  "date_of_birth",
  "place_of_birth",
  "nationality",
  "address",
  "full_address",
  "registered_address",
  "document_number",
  "npi",
  "rccm_number",
  "tax_id",
  "email",
  "phone",
];

// pino ne gère que des jokers explicites : clé à la racine, puis sur deux niveaux d'imbrication.
export const REDACT_PATHS = SENSITIVE_KEYS.flatMap((key) => [key, `*.${key}`, `*.*.${key}`]);

// Une erreur est loggée sans son message (qui peut citer une valeur du document) : type, code et pile d'appels.
export function serializeError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { type: typeof error };
  }
  const code = (error as { code?: unknown }).code;
  return {
    type: error.name,
    ...(typeof code === "string" || typeof code === "number" ? { code } : {}),
    // La première ligne de la pile répète le message : on ne garde que les appels.
    stack: error.stack?.split("\n").slice(1).join("\n"),
  };
}

export type LoggerOptions = {
  level?: string;
  destination?: DestinationStream;
};

export function createLogger(options: LoggerOptions = {}): Logger {
  return pino(
    {
      level: options.level ?? process.env.LOG_LEVEL ?? "info",
      base: { service: "kyb-back" },
      redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
      serializers: { err: serializeError, error: serializeError },
    },
    options.destination,
  );
}

export const logger = createLogger();

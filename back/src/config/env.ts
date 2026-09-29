import { existsSync } from "node:fs";
import { z } from "zod";

// En local, les variables viennent de back/.env (ignoré par git, voir .env.example).
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  MONGO_URL: z.string().min(1).default("mongodb://localhost:27017/kyb"),

  S3_ENDPOINT: z.url().default("http://localhost:9000"),
  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_BUCKET: z.string().min(1).default("kyb-documents"),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),

  FILE_ENCRYPTION_KEY: z
    .string()
    .refine((value) => Buffer.from(value, "base64").length === 32, {
      message: "FILE_ENCRYPTION_KEY doit faire 32 octets encodés en base64.",
    }),

  OPENAI_API_KEY: z.string().optional(),
  // live : appels réels ; record : appels réels + enregistrement dans fixtures/llm ; replay : rejoue sans appel réseau.
  LLM_MODE: z.enum(["live", "replay", "record"]).default("live"),
  // Modèles par défaut : vision + Structured Outputs + temperature supportés. Surchargeables dans back/.env.
  LLM_MODEL_CLASSIFY: z.string().min(1).default("gpt-4.1-mini"),
  LLM_MODEL_EXTRACT: z.string().min(1).default("gpt-4.1"),
  LLM_MODEL_GENERATE: z.string().min(1).default("gpt-4.1"),
  LLM_FIXTURES_DIR: z.string().optional(),

  PDF_RENDER_DPI: z.coerce.number().int().positive().default(200),
  MAX_FILE_BYTES: z.coerce.number().int().positive().default(15 * 1024 * 1024),
  MAX_PAGES: z.coerce.number().int().positive().default(30),
  WEB_ORIGIN: z.url().default("http://localhost:3000"),
}).superRefine((value, ctx) => {
  if (value.LLM_MODE !== "replay" && !value.OPENAI_API_KEY) {
    ctx.addIssue({
      code: "custom",
      path: ["OPENAI_API_KEY"],
      message: `requise en LLM_MODE=${value.LLM_MODE} (utiliser LLM_MODE=replay pour travailler sans clé).`,
    });
  }
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  // Une variable laissée vide dans .env (`LLM_MODEL_EXTRACT=`) vaut « non renseignée » : la valeur par défaut s'applique.
  const defined = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== ""));
  const result = EnvSchema.safeParse(defined);
  if (!result.success) {
    // Ne logge que le nom des variables fautives, jamais leur valeur.
    const invalid = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Configuration invalide :\n  ${invalid.join("\n  ")}`);
  }
  return result.data;
}

export const env = loadEnv();

// Clé AES-256-GCM des fichiers et des sorties d'extraction.
export const encryptionKey = Buffer.from(env.FILE_ENCRYPTION_KEY, "base64");

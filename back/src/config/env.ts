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
  LLM_MODE: z.enum(["live", "replay", "record"]).default("live"),
  LLM_MODEL_CLASSIFY: z.string().optional(),
  LLM_MODEL_EXTRACT: z.string().optional(),
  LLM_MODEL_GENERATE: z.string().optional(),

  PDF_RENDER_DPI: z.coerce.number().int().positive().default(200),
  MAX_FILE_BYTES: z.coerce.number().int().positive().default(15 * 1024 * 1024),
  MAX_PAGES: z.coerce.number().int().positive().default(30),
  WEB_ORIGIN: z.url().default("http://localhost:3000"),
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    // Ne logge que le nom des variables fautives, jamais leur valeur.
    const invalid = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Configuration invalide :\n  ${invalid.join("\n  ")}`);
  }
  return result.data;
}

export const env = loadEnv();

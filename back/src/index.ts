import { env } from "./config/env.js";
import { connectMongo, closeMongo } from "./db/client.js";
import { ensureDocumentIndexes } from "./db/documents.js";
import { resumeDocumentProcessing } from "./documents/processing.js";
import { ensureBucket } from "./documents/storage.js";
import { createApp } from "./app.js";
import { logger, serializeError } from "./logger.js";

async function main() {
  await connectMongo();
  await ensureDocumentIndexes();
  await ensureBucket();

  const app = createApp();

  const server = app.listen(env.PORT, () => {
    logger.info({ event: "server.started", port: env.PORT, llm_mode: env.LLM_MODE }, "server.started");
  });

  const resumed = await resumeDocumentProcessing();
  if (resumed > 0) {
    logger.info({ event: "documents.resumed", count: resumed }, "documents.resumed");
  }

  const shutdown = () => {
    server.close(() => {
      closeMongo().finally(() => process.exit(0));
    });
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

// Au démarrage (config, connexion Mongo/MinIO, port), aucune donnée de dossier n'est en jeu : on garde le détail
// utile au diagnostic, y compris pour une erreur qui n'est pas une instance d'Error. La config ne cite que des noms
// de variables, jamais leurs valeurs.
function startupFailure(error: unknown): Record<string, unknown> {
  const e = error as { name?: unknown; code?: unknown; message?: unknown; $metadata?: { httpStatusCode?: unknown }; cause?: unknown };
  return {
    event: "server.start_failed",
    err: serializeError(error),
    kind: error?.constructor?.name ?? typeof error,
    name: e?.name,
    code: e?.code,
    http_status: e?.$metadata?.httpStatusCode,
    message: typeof e?.message === "string" && e.message ? e.message : String(error),
    cause: e?.cause instanceof Error ? `${e.cause.name}: ${e.cause.message}` : undefined,
    hint: "Vérifier que MongoDB (27017) et MinIO (9000) sont démarrés et que le port de l'API est libre.",
  };
}

main().catch((error) => {
  logger.fatal(startupFailure(error), "server.start_failed");
  process.exit(1);
});

// Une erreur hors de main (ex. port déjà utilisé, signalée par un événement) doit aussi être lisible.
process.on("uncaughtException", (error) => {
  logger.fatal(startupFailure(error), "server.crashed");
  process.exit(1);
});

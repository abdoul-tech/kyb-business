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

main().catch((error) => {
  // Au démarrage (config, connexion Mongo/MinIO), aucune donnée de dossier n'est en jeu : le message est
  // conservé pour le diagnostic. La config ne cite que des noms de variables, jamais leurs valeurs.
  logger.fatal(
    { event: "server.start_failed", err: serializeError(error), message: (error as Error)?.message },
    "server.start_failed",
  );
  process.exit(1);
});

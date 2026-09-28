import { env } from "./config/env.js";
import { connectMongo, closeMongo } from "./db/client.js";
import { ensureDocumentIndexes } from "./db/documents.js";
import { resumeDocumentProcessing } from "./documents/processing.js";
import { ensureBucket } from "./documents/storage.js";
import { createApp } from "./app.js";

async function main() {
  await connectMongo();
  await ensureDocumentIndexes();
  await ensureBucket();

  const app = createApp();

  const server = app.listen(env.PORT, () => {
    console.log(`back listening on port ${env.PORT}`);
  });

  const resumed = await resumeDocumentProcessing();
  if (resumed > 0) {
    console.log(`${resumed} document(s) en attente relancé(s)`);
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
  console.error("Échec du démarrage du serveur", error);
  process.exit(1);
});

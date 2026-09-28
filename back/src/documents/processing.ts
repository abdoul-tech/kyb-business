import { mongoDocumentStore } from "../db/documents.js";
import { resumePendingDocuments, runDocumentPipeline, type PipelineDeps } from "./pipeline.js";
import { createDocumentQueue } from "./queue.js";
import { getDecryptedObject } from "./storage.js";

// Branchement réel du pipeline. Classification et extraction LLM arrivent aux étapes suivantes du J2 :
// en attendant, le type est `unknown`, le document passe en `needs_type_confirmation` et le client choisit le type.
const deps: PipelineDeps = {
  store: mongoDocumentStore,
  loadContent: (document) => getDecryptedObject(document.storage_key),
  classify: async () => ({ type: "unknown", confidence: 0 }),
  extract: async () => {
    throw new Error("Extraction non disponible.");
  },
  logger: {
    info: (event, data) => console.log(JSON.stringify({ level: "info", event, ...data })),
    error: (event, data) => console.error(JSON.stringify({ level: "error", event, ...data })),
  },
};

export const documentQueue = createDocumentQueue((documentId) => runDocumentPipeline(documentId, deps));

export function resumeDocumentProcessing(): Promise<number> {
  return resumePendingDocuments(mongoDocumentStore, documentQueue);
}

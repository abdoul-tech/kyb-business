import { env } from "../config/env.js";
import { mongoDocumentStore } from "../db/documents.js";
import { llm } from "../llm/index.js";
import { createClassifier } from "./classifier.js";
import { createExtractor } from "./extractor.js";
import { resumePendingDocuments, runDocumentPipeline, type PipelineDeps } from "./pipeline.js";
import { createDocumentQueue } from "./queue.js";
import { getDecryptedObject } from "./storage.js";

// Branchement réel du pipeline : classification puis extraction par le LLM (mode LLM_MODE).
const deps: PipelineDeps = {
  store: mongoDocumentStore,
  loadContent: (document) => getDecryptedObject(document.storage_key),
  classify: createClassifier(llm),
  extract: createExtractor(llm, { dpi: env.PDF_RENDER_DPI }),
  logger: {
    info: (event, data) => console.log(JSON.stringify({ level: "info", event, ...data })),
    error: (event, data) => console.error(JSON.stringify({ level: "error", event, ...data })),
  },
};

export const documentQueue = createDocumentQueue((documentId) => runDocumentPipeline(documentId, deps));

export function resumeDocumentProcessing(): Promise<number> {
  return resumePendingDocuments(mongoDocumentStore, documentQueue);
}

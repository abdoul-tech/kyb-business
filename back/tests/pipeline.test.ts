import { describe, expect, it, vi } from "vitest";
import {
  PipelineError,
  resumePendingDocuments,
  runDocumentPipeline,
  type PipelineDeps,
} from "../src/documents/pipeline.js";
import { makeRecord, MemoryDocumentStore } from "./helpers/memory-store.js";

function makeDeps(store: MemoryDocumentStore, overrides: Partial<PipelineDeps> = {}) {
  const logger = { info: vi.fn(), error: vi.fn() };
  const deps: PipelineDeps = {
    store,
    loadContent: vi.fn(async () => Buffer.from("contenu")),
    classify: vi.fn(async () => ({ type: "rccm" as const, confidence: 0.95 })),
    extract: vi.fn(async () => ({ legal_name: { value: "SAIDOU AUTO SARL", confidence: 0.9, source_page: 1 } })),
    logger,
    ...overrides,
  };
  return { deps, logger };
}

describe("runDocumentPipeline", () => {
  it("enchaîne classification puis extraction jusqu'à `extracted`", async () => {
    const store = new MemoryDocumentStore([makeRecord()]);
    const { deps } = makeDeps(store);

    await runDocumentPipeline("doc_1", deps);

    const doc = await store.findById("doc_1");
    expect(store.history).toEqual(["classifying", "extracting", "extracted"]);
    expect(doc).toMatchObject({ status: "extracted", type: "rccm", type_confidence: 0.95, error_code: null });
    expect(doc?.extracted_data).toBeTruthy();
    expect(deps.loadContent).toHaveBeenCalledTimes(1);
  });

  it("demande une confirmation du type sous le seuil de confiance", async () => {
    const store = new MemoryDocumentStore([makeRecord()]);
    const { deps } = makeDeps(store, { classify: async () => ({ type: "statuts", confidence: 0.69 }) });

    await runDocumentPipeline("doc_1", deps);

    expect(await store.findById("doc_1")).toMatchObject({
      status: "needs_type_confirmation",
      type: "statuts",
      type_confidence: 0.69,
    });
    expect(deps.extract).not.toHaveBeenCalled();
  });

  it("demande une confirmation si le type est `unknown`, sans enregistrer de type", async () => {
    const store = new MemoryDocumentStore([makeRecord()]);
    const { deps } = makeDeps(store, { classify: async () => ({ type: "unknown", confidence: 0.99 }) });

    await runDocumentPipeline("doc_1", deps);

    expect(await store.findById("doc_1")).toMatchObject({ status: "needs_type_confirmation", type: null });
  });

  it("accepte exactement le seuil de 0,7", async () => {
    const store = new MemoryDocumentStore([makeRecord()]);
    const { deps } = makeDeps(store, { classify: async () => ({ type: "rccm", confidence: 0.7 }) });

    await runDocumentPipeline("doc_1", deps);

    expect((await store.findById("doc_1"))?.status).toBe("extracted");
  });

  it("reprend un document resté en `extracting` sans le reclassifier", async () => {
    const store = new MemoryDocumentStore([makeRecord({ status: "extracting", type: "id_document" })]);
    const { deps } = makeDeps(store);

    await runDocumentPipeline("doc_1", deps);

    expect(deps.classify).not.toHaveBeenCalled();
    expect(deps.extract).toHaveBeenCalledWith(expect.objectContaining({ type: "id_document" }));
    expect((await store.findById("doc_1"))?.status).toBe("extracted");
  });

  it("reprend un document resté en `classifying`", async () => {
    const store = new MemoryDocumentStore([makeRecord({ status: "classifying" })]);
    const { deps } = makeDeps(store);

    await runDocumentPipeline("doc_1", deps);

    expect(deps.classify).toHaveBeenCalledTimes(1);
    expect((await store.findById("doc_1"))?.status).toBe("extracted");
  });

  it("passe en `failed` avec le code de l'erreur métier", async () => {
    const store = new MemoryDocumentStore([makeRecord()]);
    const { deps, logger } = makeDeps(store, {
      extract: async () => {
        throw new PipelineError("DOCUMENT_UNREADABLE");
      },
    });

    await runDocumentPipeline("doc_1", deps);

    expect(await store.findById("doc_1")).toMatchObject({ status: "failed", error_code: "DOCUMENT_UNREADABLE" });
    expect(logger.error).toHaveBeenCalledWith(
      "document.failed",
      expect.objectContaining({ document_id: "doc_1", stage: "extracting" }),
    );
  });

  it("utilise un code générique pour une erreur inattendue et ne logge pas son message", async () => {
    const store = new MemoryDocumentStore([makeRecord()]);
    const { deps, logger } = makeDeps(store, {
      classify: async () => {
        throw new Error("Jean Dupont né le 01/01/1980");
      },
    });

    await runDocumentPipeline("doc_1", deps);

    expect(await store.findById("doc_1")).toMatchObject({ status: "failed", error_code: "PROCESSING_FAILED" });
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain("Dupont");
  });

  it("ne touche pas aux documents déjà traités ou en attente du client", async () => {
    for (const status of ["extracted", "failed", "needs_type_confirmation"] as const) {
      const store = new MemoryDocumentStore([makeRecord({ status })]);
      const { deps } = makeDeps(store);

      await runDocumentPipeline("doc_1", deps);

      expect(store.history).toEqual([]);
      expect(deps.loadContent).not.toHaveBeenCalled();
    }
  });

  it("s'arrête sans erreur si le document est supprimé pendant le traitement", async () => {
    const store = new MemoryDocumentStore([makeRecord()]);
    const { deps, logger } = makeDeps(store, {
      classify: async () => {
        store.documents.delete("doc_1");
        return { type: "rccm", confidence: 0.9 };
      },
    });

    await runDocumentPipeline("doc_1", deps);

    expect(store.documents.has("doc_1")).toBe(false);
    expect(deps.extract).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("ignore un document inexistant", async () => {
    const store = new MemoryDocumentStore();
    const { deps } = makeDeps(store);

    await expect(runDocumentPipeline("absent", deps)).resolves.toBeUndefined();
  });
});

describe("resumePendingDocuments", () => {
  it("relance uniquement les documents en cours de traitement", async () => {
    const store = new MemoryDocumentStore([
      makeRecord({ _id: "a", status: "uploaded" }),
      makeRecord({ _id: "b", status: "classifying" }),
      makeRecord({ _id: "c", status: "extracting" }),
      makeRecord({ _id: "d", status: "extracted" }),
      makeRecord({ _id: "e", status: "needs_type_confirmation" }),
      makeRecord({ _id: "f", status: "failed" }),
    ]);
    const enqueue = vi.fn();

    const count = await resumePendingDocuments(store, { enqueue });

    expect(count).toBe(3);
    expect(enqueue.mock.calls.map(([id]) => id)).toEqual(["a", "b", "c"]);
  });
});

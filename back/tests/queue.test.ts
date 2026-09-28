import { describe, expect, it } from "vitest";
import { createDocumentQueue } from "../src/documents/queue.js";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("createDocumentQueue", () => {
  it("limite le nombre de traitements simultanés", async () => {
    let active = 0;
    let maxActive = 0;
    const queue = createDocumentQueue(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active--;
    }, 3);

    for (let i = 0; i < 10; i++) {
      queue.enqueue(`doc_${i}`);
    }
    await queue.onIdle();

    expect(maxActive).toBe(3);
  });

  it("ignore un document déjà en attente dans la file", async () => {
    const runs: string[] = [];
    const gate = deferred();
    const queue = createDocumentQueue(async (id) => {
      runs.push(id);
      await gate.promise;
    }, 1);

    queue.enqueue("bloquant");
    queue.enqueue("doc_1");
    queue.enqueue("doc_1");
    gate.resolve();
    await queue.onIdle();

    expect(runs).toEqual(["bloquant", "doc_1"]);
  });

  it("ne traite jamais un document deux fois en parallèle et le relance après s'il est remis en file", async () => {
    const runs: string[] = [];
    let active = 0;
    let maxActive = 0;
    const gate = deferred();
    const queue = createDocumentQueue(async (id) => {
      runs.push(id);
      active++;
      maxActive = Math.max(maxActive, active);
      if (runs.length === 1) {
        await gate.promise;
      }
      active--;
    }, 3);

    queue.enqueue("doc_1");
    await new Promise((resolve) => setTimeout(resolve, 0));
    queue.enqueue("doc_1");
    queue.enqueue("doc_1");
    gate.resolve();
    await queue.onIdle();
    await queue.onIdle();

    expect(maxActive).toBe(1);
    expect(runs).toEqual(["doc_1", "doc_1"]);
  });

  it("continue après une erreur d'un traitement", async () => {
    const runs: string[] = [];
    const queue = createDocumentQueue(async (id) => {
      runs.push(id);
      if (id === "casse") {
        throw new Error("boom");
      }
    }, 1);

    queue.enqueue("casse");
    queue.enqueue("ok");
    await queue.onIdle();

    expect(runs).toEqual(["casse", "ok"]);
  });
});

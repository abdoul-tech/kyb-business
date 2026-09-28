import PQueue from "p-queue";

export type DocumentQueue = {
  enqueue(documentId: string): void;
  onIdle(): Promise<void>;
};

// File en mémoire (spec : p-queue, concurrence 3 ; le statut fait foi en base).
// Un document n'est jamais traité deux fois en parallèle : s'il est remis en file pendant son traitement
// (ex. type confirmé par le client), il est relancé juste après la fin du traitement en cours.
export function createDocumentQueue(run: (documentId: string) => Promise<void>, concurrency = 3): DocumentQueue {
  const queue = new PQueue({ concurrency });
  const queued = new Set<string>();
  const running = new Set<string>();
  const rerun = new Set<string>();

  function enqueue(documentId: string): void {
    if (running.has(documentId)) {
      rerun.add(documentId);
      return;
    }
    if (queued.has(documentId)) {
      return;
    }

    queued.add(documentId);
    void queue.add(async () => {
      queued.delete(documentId);
      running.add(documentId);
      try {
        await run(documentId);
      } catch {
        // `run` gère ses erreurs (statut `failed`) ; on protège seulement la file.
      } finally {
        running.delete(documentId);
        if (rerun.delete(documentId)) {
          enqueue(documentId);
        }
      }
    });
  }

  return {
    enqueue,
    onIdle: () => queue.onIdle(),
  };
}

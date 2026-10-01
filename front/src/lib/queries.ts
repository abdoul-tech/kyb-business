"use client";

import type { ApplicationView } from "@kyb/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export const applicationKey = (id: string) => ["application", id] as const;

// Spec : le front interroge le dossier toutes les 2 s tant qu'un document est en cours de traitement.
const POLL_INTERVAL_MS = 2000;

export function useApplication(id: string) {
  return useQuery({
    queryKey: applicationKey(id),
    queryFn: () => api.getApplication(id),
    refetchInterval: (query) => ((query.state.data?.processing_documents ?? 0) > 0 ? POLL_INTERVAL_MS : false),
    retry: (count, error) => count < 2 && (error as { status?: number }).status !== 401,
  });
}

// Remplace le dossier en cache par la réponse d'une mutation (les routes d'écriture renvoient le dossier complet).
export function useSetApplication(id: string) {
  const queryClient = useQueryClient();
  return (view: ApplicationView) => queryClient.setQueryData(applicationKey(id), view);
}

export function useRefreshApplication(id: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: applicationKey(id) });
}

export function useConfirmDocumentType(id: string) {
  const refresh = useRefreshApplication(id);
  return useMutation({
    mutationFn: ({ docId, type }: { docId: string; type: Parameters<typeof api.confirmDocumentType>[2] }) =>
      api.confirmDocumentType(id, docId, type),
    onSuccess: refresh,
  });
}

export function useDeleteDocument(id: string) {
  const refresh = useRefreshApplication(id);
  return useMutation({ mutationFn: (docId: string) => api.deleteDocument(id, docId), onSuccess: refresh });
}

export function useUboMutations(id: string) {
  const setApplication = useSetApplication(id);
  const add = useMutation({
    mutationKey: ["save", id],
    mutationFn: (body: Parameters<typeof api.addUbo>[1]) => api.addUbo(id, body),
    onSuccess: (result) => setApplication(result.application),
  });
  const update = useMutation({
    mutationKey: ["save", id],
    mutationFn: ({ uboId, body }: { uboId: string; body: Parameters<typeof api.updateUbo>[2] }) =>
      api.updateUbo(id, uboId, body),
    onSuccess: setApplication,
  });
  const remove = useMutation({
    mutationKey: ["save", id],
    mutationFn: (uboId: string) => api.deleteUbo(id, uboId),
    onSuccess: setApplication,
  });
  return { add, update, remove };
}

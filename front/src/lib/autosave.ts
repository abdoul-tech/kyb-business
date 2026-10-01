"use client";

import type { ApplicationPatch, UboRevertKey, UpdateUboRequest } from "@kyb/shared";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiRequestError } from "./api";
import { useSetApplication } from "./queries";

// Spec : autosave avec debounce de 800 ms.
export const AUTOSAVE_DELAY_MS = 800;

type Errors = Record<string, string>;

// Regroupe les modifications d'une même cible pendant le délai, puis les envoie en un seul appel.
// Les modifications en attente partent immédiatement si le composant est démonté (changement d'écran).
function useBatcher<P extends Record<string, unknown>>(send: (target: string, batch: P) => void) {
  const pending = useRef(new Map<string, P>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  });

  const flush = useCallback((target: string) => {
    clearTimeout(timers.current.get(target));
    timers.current.delete(target);
    const batch = pending.current.get(target);
    pending.current.delete(target);
    if (batch && Object.keys(batch).length > 0) {
      sendRef.current(target, batch);
    }
  }, []);

  const queue = useCallback(
    (target: string, patch: P) => {
      pending.current.set(target, { ...(pending.current.get(target) ?? ({} as P)), ...patch });
      clearTimeout(timers.current.get(target));
      timers.current.set(
        target,
        setTimeout(() => flush(target), AUTOSAVE_DELAY_MS),
      );
    },
    [flush],
  );

  // Retire un champ en attente d'envoi (ex. « Revenir à la valeur des documents » juste après une frappe).
  const drop = useCallback((target: string, key: string) => {
    const batch = pending.current.get(target);
    if (batch && key in batch) {
      const rest = Object.fromEntries(Object.entries(batch).filter(([k]) => k !== key)) as P;
      pending.current.set(target, rest);
    }
  }, []);

  useEffect(() => {
    const targets = timers.current;
    return () => {
      for (const target of [...targets.keys()]) {
        flush(target);
      }
    };
  }, [flush]);

  return { queue, drop };
}

// Retire les erreurs d'un champ, et l'erreur globale, quand le client modifie ce champ.
function without(errors: Errors, key: string): Errors {
  return Object.fromEntries(Object.entries(errors).filter(([k]) => k !== key && k !== "_"));
}

function errorsFrom(error: unknown, prefix: string): Errors {
  if (!(error instanceof ApiRequestError)) {
    return { _: "Enregistrement impossible : vérifiez votre connexion." };
  }
  if (error.fields.length === 0) {
    return { _: error.message };
  }
  return Object.fromEntries(error.fields.map((f) => [f.field.replace(prefix, ""), f.message]));
}

type Business = NonNullable<ApplicationPatch["business"]>;

// Autosave des champs de l'entreprise (PATCH /applications/{id}).
export function useBusinessAutosave(id: string) {
  const setApplication = useSetApplication(id);
  const [errors, setErrors] = useState<Errors>({});
  const mutation = useMutation({
    mutationKey: ["save", id],
    mutationFn: (patch: ApplicationPatch) => api.patchApplication(id, patch),
    onSuccess: setApplication,
    onError: (error) => setErrors((current) => ({ ...current, ...errorsFrom(error, "business.") })),
  });
  const mutate = mutation.mutate;
  const { queue, drop } = useBatcher<Business>((_, batch) => mutate({ business: batch }));

  const save = useCallback(
    <K extends keyof Business>(key: K, value: Business[K]) => {
      setErrors((current) => without(current, key as string));
      queue("business", { [key]: value } as Business);
    },
    [queue],
  );

  // Supprime la saisie du client : la valeur des documents (ou déduite) redevient celle du dossier.
  const revert = useCallback(
    (key: keyof Business) => {
      drop("business", key);
      setErrors((current) => without(current, key));
      mutate({ revert: [key] });
    },
    [drop, mutate],
  );

  return { save, revert, errors };
}

// Autosave des personnes (PATCH /applications/{id}/ubos/{uboId}), une file par personne.
export function useUboAutosave(id: string) {
  const setApplication = useSetApplication(id);
  const [errors, setErrors] = useState<Record<string, Errors>>({});
  const mutation = useMutation({
    mutationKey: ["save", id],
    mutationFn: ({ uboId, body }: { uboId: string; body: UpdateUboRequest }) => api.updateUbo(id, uboId, body),
    onSuccess: setApplication,
    onError: (error, { uboId }) =>
      setErrors((current) => ({ ...current, [uboId]: { ...current[uboId], ...errorsFrom(error, "") } })),
  });
  const mutate = mutation.mutate;
  const { queue, drop } = useBatcher<UpdateUboRequest>((uboId, body) => mutate({ uboId, body }));

  const save = useCallback(
    <K extends keyof UpdateUboRequest>(uboId: string, key: K, value: UpdateUboRequest[K]) => {
      setErrors((current) => ({ ...current, [uboId]: without(current[uboId] ?? {}, key as string) }));
      queue(uboId, { [key]: value } as UpdateUboRequest);
    },
    [queue],
  );

  const revert = useCallback(
    (uboId: string, key: UboRevertKey) => {
      drop(uboId, key);
      setErrors((current) => ({ ...current, [uboId]: without(current[uboId] ?? {}, key) }));
      mutate({ uboId, body: { revert: [key] } });
    },
    [drop, mutate],
  );

  return { save, revert, errors };
}

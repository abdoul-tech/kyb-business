"use client";

import type { ApplicationView } from "@kyb/shared";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { ApiRequestError } from "@/lib/api";
import { LAST_APPLICATION_KEY, steps, type StepKey } from "@/lib/navigation";
import { useApplication } from "@/lib/queries";
import { AppShell } from "./AppShell";

type Dossier = { id: string; view: ApplicationView };

const DossierContext = createContext<Dossier | null>(null);

// Dossier courant pour les écrans de /dossier/[id] : toujours chargé quand l'écran s'affiche.
export function useDossier(): Dossier {
  const dossier = useContext(DossierContext);
  if (!dossier) {
    throw new Error("useDossier doit être utilisé sous DossierShell");
  }
  return dossier;
}

export function DossierShell({ children }: { children: ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const activeStep = steps.find((step) => pathname.endsWith(`/${step.key}`))?.key as StepKey | undefined;
  const { data, error, isPending } = useApplication(id);

  useEffect(() => {
    if (data) {
      try {
        localStorage.setItem(LAST_APPLICATION_KEY, id);
      } catch {
        // Stockage indisponible (navigation privée) : on ne propose simplement pas la reprise.
      }
    }
  }, [data, id]);

  let content: ReactNode;
  if (data) {
    content = <DossierContext.Provider value={{ id, view: data }}>{children}</DossierContext.Provider>;
  } else if (isPending) {
    content = <p className="muted-copy loading-state">Chargement du dossier…</p>;
  } else {
    const unauthorized = error instanceof ApiRequestError && [401, 404].includes(error.status);
    content = (
      <div className="content-section empty-state">
        <h2>{unauthorized ? "Ce dossier n’est pas accessible depuis ce navigateur." : "Le dossier n’a pas pu être chargé."}</h2>
        <p className="muted-copy">
          {unauthorized
            ? "Le lien de reprise n’est pas encore disponible : ouvrez le dossier depuis le navigateur où il a été créé, ou commencez un nouveau dossier."
            : "Vérifiez votre connexion puis rechargez la page."}
        </p>
        <Link className="button button-secondary" href="/">
          Retour à l’accueil
        </Link>
      </div>
    );
  }

  return (
    <AppShell applicationId={id} activeStep={activeStep}>
      {content}
    </AppShell>
  );
}

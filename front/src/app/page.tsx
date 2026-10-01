"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { PageIntro } from "@/components/layout/PageIntro";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import { LAST_APPLICATION_KEY, stepHref } from "@/lib/navigation";

const DOCUMENTS_TO_PREPARE = [
  "Extrait RCCM (ou registre du commerce local)",
  "Statuts de la société",
  "Passeport ou CNI de chaque dirigeant et associé à 25 % ou plus",
  "Facture ou relevé de moins de 90 jours au nom de l’entreprise",
  "Une facture ou un contrat avec un client",
];

// Dernier dossier ouvert dans ce navigateur (null au rendu serveur et si le stockage est indisponible).
function readLastApplication(): string | null {
  try {
    return localStorage.getItem(LAST_APPLICATION_KEY);
  } catch {
    return null;
  }
}

function subscribeStorage(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

export default function HomePage() {
  const router = useRouter();
  const lastApplication = useSyncExternalStore(subscribeStorage, readLastApplication, () => null);

  const start = useMutation({
    mutationFn: api.createApplication,
    onSuccess: ({ application_id }) => router.push(stepHref(application_id, "documents")),
  });

  return (
    <AppShell>
      <PageIntro
        eyebrow="Ouverture de compte entreprise"
        title="Préparez votre dossier en quelques minutes."
        description="Déposez les documents de votre entreprise : nous en lisons les informations pour vous. Vous ne complétez que ce qui manque."
      />
      <section className="content-section start-section">
        <div>
          <p className="eyebrow">À préparer</p>
          <h2>Les documents utiles</h2>
          <ul className="prepare-list">
            {DOCUMENTS_TO_PREPARE.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="muted-copy">PDF, JPG ou PNG, 15 Mo et 30 pages maximum par fichier. Vous pourrez en ajouter à tout moment.</p>
        </div>
        <div className="start-actions">
          <Button onClick={() => start.mutate()} disabled={start.isPending}>
            {start.isPending ? "Création…" : "Commencer mon dossier"} <span aria-hidden="true">→</span>
          </Button>
          {lastApplication ? (
            <Button variant="secondary" href={stepHref(lastApplication, "documents")}>
              Reprendre mon dossier en cours
            </Button>
          ) : null}
          {start.error ? <p className="form-error">{start.error.message}</p> : null}
        </div>
      </section>
    </AppShell>
  );
}

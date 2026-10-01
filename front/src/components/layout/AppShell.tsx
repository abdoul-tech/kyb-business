"use client";

import { useIsMutating } from "@tanstack/react-query";
import Link from "next/link";
import type { ReactNode } from "react";
import { stepHref, steps, type StepKey } from "@/lib/navigation";

function SaveState({ applicationId }: { applicationId: string }) {
  const saving = useIsMutating({ mutationKey: ["save", applicationId] }) > 0;
  return (
    <span className="save-state" aria-live="polite">
      <span className={`save-dot ${saving ? "save-dot-busy" : ""}`} />
      {saving ? "Enregistrement…" : "Brouillon sauvegardé"}
    </span>
  );
}

export function AppShell({
  applicationId,
  activeStep,
  children,
}: {
  applicationId?: string;
  activeStep?: StepKey;
  children: ReactNode;
}) {
  const activeIndex = steps.findIndex((step) => step.key === activeStep);
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Accueil">
          <span className="brand-mark">S</span>
          <span>
            Sako <em>Business</em>
          </span>
        </Link>
        <div className="topbar-meta">{applicationId ? <SaveState applicationId={applicationId} /> : null}</div>
      </header>
      {applicationId ? (
        <div className="progress-wrap">
          <nav className="stepper" aria-label="Progression du dossier">
            {steps.map((step, index) => {
              const active = index === activeIndex;
              const complete = activeIndex > index;
              return (
                <Link
                  className={`step ${active ? "step-active" : ""} ${complete ? "step-complete" : ""}`}
                  href={stepHref(applicationId, step.key)}
                  aria-current={active ? "step" : undefined}
                  key={step.key}
                >
                  <span className="step-number">{complete ? "✓" : step.number}</span>
                  <span>{step.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      ) : null}
      <main className="main-content">{children}</main>
      <footer className="app-footer">
        <span>Besoin d’aide ?</span>
        <span>Les informations sont chiffrées et confidentielles.</span>
      </footer>
    </div>
  );
}

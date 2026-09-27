import Link from "next/link";
import type { ReactNode } from "react";
import { steps } from "@/lib/navigation";
import type { StepKey } from "@/types/onboarding";

export function AppShell({ activeStep, children }: { activeStep: StepKey; children: ReactNode }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/documents" aria-label="Retour aux documents">
          <span className="brand-mark">S</span>
          <span>Sako <em>Business</em></span>
        </Link>
        <div className="topbar-meta">
          <span className="save-state"><span className="save-dot" /> Brouillon sauvegardé</span>
          <button className="avatar" aria-label="Compte utilisateur">AD</button>
        </div>
      </header>
      <div className="progress-wrap">
        <nav className="stepper" aria-label="Progression du dossier">
          {steps.map((step, index) => {
            const active = step.key === activeStep;
            const complete = steps.findIndex((item) => item.key === activeStep) > index;
            return (
              <Link className={`step ${active ? "step-active" : ""} ${complete ? "step-complete" : ""}`} href={step.href} key={step.key}>
                <span className="step-number">{complete ? "✓" : step.number}</span>
                <span>{step.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
      <main className="main-content">{children}</main>
      <footer className="app-footer"><span>Besoin d’aide ?</span><span>Les informations sont chiffrées et confidentielles.</span></footer>
    </div>
  );
}

"use client";

import { AppShell } from "@/components/layout/AppShell";
import { useOnboarding } from "@/context/OnboardingContext";
import { PageIntro } from "@/components/layout/PageIntro";
import { StepFooter } from "@/components/layout/StepFooter";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";

export default function SummaryPage() {
  const { documents, alerts, explanation, submitted, setExplanation, setSubmitted } = useOnboarding();
  return <AppShell activeStep="summary">
    <PageIntro eyebrow="Étape 04 / 04" title="Votre dossier est presque prêt." description="Voici une dernière vue d’ensemble avant la soumission. Les éléments bloquants doivent être complétés ou expliqués." aside={<div className="readiness"><span>État du dossier</span><strong>À compléter</strong><StatusBadge tone="warning">1 blocage</StatusBadge></div>} />
    <div className="summary-grid"><div className="summary-main">
      <section className="content-section"><div className="section-heading"><div><p className="eyebrow">Documents</p><h2>Pièces fournies</h2></div><StatusBadge tone="success">{`${documents.length} reçues`}</StatusBadge></div><div className="requirements-list">{documents.map((document) => <div className="requirement-row" key={document.id}><span className="check-mark">✓</span><div><strong>{document.kind}</strong><span>{document.name}</span></div><StatusBadge tone="success">Fourni</StatusBadge></div>)}<div className="requirement-row missing"><span className="check-mark">!</span><div><strong>Ownership document</strong><span>Répartition du capital manquante</span></div><StatusBadge tone="danger">Manquant</StatusBadge></div></div></section>
      <section className="content-section"><div className="section-heading"><div><p className="eyebrow">Action requise</p><h2>Expliquez la pièce manquante</h2></div><StatusBadge tone="danger">Bloquant</StatusBadge></div><p className="muted-copy">Une explication permet de poursuivre temporairement le dossier. Vous pourrez ajouter l’attestation de propriété plus tard.</p><textarea className="summary-textarea" value={explanation} onChange={(event) => setExplanation(event.target.value)} placeholder="Expliquez pourquoi cette pièce n’est pas encore disponible..." /></section>
    </div><aside className="alert-panel"><div className="section-heading"><div><p className="eyebrow">Contrôles KYB</p><h2>Points d’attention</h2></div></div>{alerts.map((alert) => <div className={`alert-item alert-${alert.severity}`} key={alert.id}><span className="alert-icon">{alert.severity === "blocking" ? "!" : "i"}</span><div><strong>{alert.title}</strong><p>{alert.detail}</p></div></div>)}<div className="submit-box"><span>Prêt à soumettre ?</span><Button disabled={!explanation || submitted} onClick={() => setSubmitted(true)}>{submitted ? "Dossier soumis" : "Soumettre le dossier"}</Button></div></aside></div>
    <StepFooter backHref="/complete" nextHref="/summary" nextLabel="Enregistrer le brouillon" />
  </AppShell>;
}

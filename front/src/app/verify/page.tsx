"use client";

import { AppShell } from "@/components/layout/AppShell";
import { useOnboarding } from "@/context/OnboardingContext";
import { PageIntro } from "@/components/layout/PageIntro";
import { StepFooter } from "@/components/layout/StepFooter";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { ExtractedField } from "@/types/onboarding";

function FieldCard({ field, onChange }: { field: ExtractedField; onChange: (value: string) => void }) {
  const needsReview = field.confidence < 0.8;
  return <label className={`field-card ${needsReview ? "field-needs-review" : ""}`}><span className="field-label">{field.label}{needsReview ? <StatusBadge tone="warning">À vérifier</StatusBadge> : null}</span><input value={field.value} onChange={(event) => onChange(event.target.value)} /><span className="field-source">Extrait de <strong>{field.source}</strong> · p. {field.page} · {Math.round(field.confidence * 100)} %</span></label>;
}

export default function VerifyPage() {
  const { companyFields, peopleFields, updateCompanyField, updatePeopleField } = useOnboarding();
  return <AppShell activeStep="verify">
    <PageIntro eyebrow="Étape 02 / 04" title="Vérifiez les informations extraites." description="Nous avons préparé votre dossier à partir de vos documents. Les éléments en jaune méritent une vérification." aside={<div className="review-score"><span>Confiance moyenne</span><strong>88 %</strong><div className="score-bar"><span style={{ width: "88%" }} /></div></div>} />
    <div className="verify-grid"><div className="verify-sections">
      <section className="content-section"><div className="section-heading"><div><p className="eyebrow">Formation</p><h2>Entreprise</h2></div><StatusBadge tone="success">6 champs trouvés</StatusBadge></div><div className="field-grid">{companyFields.map((field) => <FieldCard field={field} onChange={(value) => updateCompanyField(field.id, value)} key={field.id} />)}</div></section>
      <section className="content-section"><div className="section-heading"><div><p className="eyebrow">UBO information</p><h2>Dirigeant principal</h2></div><StatusBadge tone="warning">1 à vérifier</StatusBadge></div><div className="field-grid">{peopleFields.map((field) => <FieldCard field={field} onChange={(value) => updatePeopleField(field.id, value)} key={field.id} />)}</div></section>
    </div><aside className="source-panel"><div className="source-toolbar"><strong>Extrait_RCCM_SAIDOU.pdf</strong><span>Page 1 / 3</span></div><div className="source-paper"><div className="paper-masthead">RÉPUBLIQUE TOGOLAISE<br /><small>Chambre de Commerce et d’Industrie</small></div><div className="paper-lines"><span /><span className="short" /><span /><span /><span className="highlight" /><span /><span className="short" /><span /></div><div className="paper-stamp">RCCM<br />VALIDÉ</div></div><p className="source-caption">La source du champ sélectionné s’affiche ici pour vous permettre de vérifier rapidement l’information.</p></aside></div>
    <StepFooter backHref="/documents" nextHref="/complete" />
  </AppShell>;
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { useOnboarding } from "@/context/OnboardingContext";
import { PageIntro } from "@/components/layout/PageIntro";
import { StepFooter } from "@/components/layout/StepFooter";
import { validateCompletion, type CompletionErrors } from "@/lib/validation";

export default function CompletePage() {
  const { completion, updateCompletion } = useOnboarding();
  const router = useRouter();
  const [errors, setErrors] = useState<CompletionErrors>({});
  const noWebsite = completion.noWebsite;
  function continueToSummary() {
    const nextErrors = validateCompletion(completion);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) router.push("/summary");
  }
  return <AppShell activeStep="complete">
    <PageIntro eyebrow="Étape 03 / 04" title="Quelques dernières informations." description="Ces éléments ne figurent pas dans vos documents. Ils nous aident à préparer un dossier complet pour Bridge." aside={<div className="completion-count"><strong>3</strong><span>informations<br />restantes</span></div>} />
    <form className="completion-layout">
      <section className="content-section"><div className="section-heading"><div><p className="eyebrow">Contact</p><h2>Comment vous joindre ?</h2></div><span className="required-note">Tous les champs sont requis</span></div><div className="form-grid"><label className="form-field"><span>Email professionnel</span><input type="email" value={completion.email} onChange={(event) => updateCompletion("email", event.target.value)} placeholder="nom@entreprise.com" />{errors.email ? <small className="form-error">{errors.email}</small> : null}</label><label className="form-field"><span>Téléphone professionnel</span><input type="tel" value={completion.phone} onChange={(event) => updateCompletion("phone", event.target.value)} placeholder="+228 90 00 00 00" />{errors.phone ? <small className="form-error">{errors.phone}</small> : null}</label><label className="form-field form-field-wide"><span>Site web de l’entreprise</span><input value={completion.website} onChange={(event) => updateCompletion("website", event.target.value)} disabled={noWebsite} placeholder={noWebsite ? "Pas de site web" : "https://www.entreprise.com"} />{errors.website ? <small className="form-error">{errors.website}</small> : null}</label><label className="checkbox-field form-field-wide"><input type="checkbox" checked={noWebsite} onChange={(event) => updateCompletion("noWebsite", event.target.checked)} /><span>Nous n’avons pas encore de site web</span></label></div></section>
      <section className="content-section"><div className="section-heading"><div><p className="eyebrow">Activité</p><h2>Votre activité en pratique</h2></div></div><div className="form-grid"><label className="form-field form-field-wide"><span>Description de l’activité</span><textarea rows={4} value={completion.description} onChange={(event) => updateCompletion("description", event.target.value)} />{errors.description ? <small className="form-error">{errors.description}</small> : null}</label><label className="form-field"><span>Origine principale des fonds</span><select value={completion.sourceOfFunds} onChange={(event) => updateCompletion("sourceOfFunds", event.target.value)}><option value="sales">Vente de biens et services</option><option value="capital">Capital du propriétaire</option></select></label><label className="form-field"><span>Chiffre d’affaires annuel estimé</span><select value={completion.annualRevenue} onChange={(event) => updateCompletion("annualRevenue", event.target.value)}><option value="100k">50 000 $ - 250 000 $</option><option value="250k">250 000 $ - 1 M $</option></select></label><label className="form-field"><span>Volume mensuel estimé</span><input value={completion.monthlyVolume} onChange={(event) => updateCompletion("monthlyVolume", event.target.value)} placeholder="Ex. 25 000 $" />{errors.monthlyVolume ? <small className="form-error">{errors.monthlyVolume}</small> : null}</label><label className="form-field form-field-wide"><span>Usage prévu du compte</span><textarea rows={3} value={completion.intendedUse} onChange={(event) => updateCompletion("intendedUse", event.target.value)} placeholder="Décrivez l’usage principal du compte" />{errors.intendedUse ? <small className="form-error">{errors.intendedUse}</small> : null}</label></div></section>
      <section className="content-section compact-section"><div><p className="eyebrow">Suggestion IA</p><h2>Business industry</h2><p className="muted-copy">Le code proposé à partir de votre activité pourra être confirmé à l’étape suivante.</p></div><div className="suggestion"><strong>423110</strong><span>Automotive Parts and Accessories Retailers</span><button type="button">Modifier</button></div></section>
    </form>
    <StepFooter backHref="/verify" nextHref="/summary" onNext={continueToSummary} />
  </AppShell>;
}

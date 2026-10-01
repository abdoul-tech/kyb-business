"use client";

import {
  bridgeRevenueBandValues,
  businessFieldLabelsFr,
  businessFieldSchemas,
  clientSourceOfFundsValues,
  type BusinessFieldKey,
} from "@kyb/shared";
import { useState } from "react";
import { FieldCard, type FieldKind } from "@/components/fields/FieldCard";
import { useDossier } from "@/components/layout/DossierShell";
import { PageIntro } from "@/components/layout/PageIntro";
import { StepFooter } from "@/components/layout/StepFooter";
import { useBusinessAutosave } from "@/lib/autosave";
import { stepHref } from "@/lib/navigation";

// Spec, Annexe B : le formulaire client ne propose que ces deux origines de fonds.
const SOURCE_OF_FUNDS_OPTIONS = clientSourceOfFundsValues.map((value) => ({
  value,
  label: value === "Owner's Capital" ? "Capital apporté par les associés" : "Vente de biens et services",
}));
const REVENUE_OPTIONS = bridgeRevenueBandValues.map((value) => ({ value, label: value }));

export default function CompletePage() {
  const { id, view } = useDossier();
  const { save, errors } = useBusinessAutosave(id);
  const b = view.business;
  const [noWebsite, setNoWebsite] = useState(b.website.edited_by_user && b.website.value === null);

  function card(key: BusinessFieldKey, kind: FieldKind, extra: { wide?: boolean; placeholder?: string; options?: { value: string; label: string }[] } = {}) {
    return (
      <FieldCard
        key={key}
        label={businessFieldLabelsFr[key]}
        field={b[key]}
        kind={kind}
        schema={businessFieldSchemas[key]}
        clientOnly
        error={errors[key]}
        onSave={(value) => save(key, value as never)}
        {...extra}
      />
    );
  }

  // Indicatif : le décompte officiel des champs manquants viendra de GET /status (moteur de règles, J4).
  const filled = (key: BusinessFieldKey) => b[key].value !== null && b[key].value !== "";
  const required: boolean[] = [
    filled("email"),
    filled("phone"),
    noWebsite ? filled("no_website_explanation") : filled("website"),
    filled("description"),
    filled("source_of_funds"),
    filled("annual_revenue"),
    filled("monthly_volume_usd"),
    filled("account_purpose"),
    ...(b.money_transmission.value ? [filled("money_transmission_program")] : []),
  ];
  const remaining = required.filter((ok) => !ok).length;

  return (
    <>
      <PageIntro
        eyebrow="Étape 03 / 04"
        title="Quelques dernières informations."
        description="Ces éléments ne figurent pas dans vos documents. Ils sont enregistrés au fur et à mesure de votre saisie."
        aside={
          <div className="completion-count">
            <strong>{remaining}</strong>
            <span>
              information{remaining > 1 ? "s" : ""}
              <br />
              restante{remaining > 1 ? "s" : ""}
            </span>
          </div>
        }
      />
      <form className="completion-layout" onSubmit={(event) => event.preventDefault()}>
        <section className="content-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Contact</p>
              <h2>Comment vous joindre ?</h2>
            </div>
          </div>
          <div className="form-grid">
            {card("email", "email", { placeholder: "nom@entreprise.com" })}
            {card("phone", "tel", { placeholder: "+221 77 000 00 00" })}
            {noWebsite
              ? card("no_website_explanation", "textarea", {
                  wide: true,
                  placeholder: "Ex. : nos clients nous trouvent via WhatsApp et le bouche-à-oreille.",
                })
              : card("website", "url", { wide: true, placeholder: "https://www.entreprise.com" })}
            <label className="checkbox-field form-field-wide">
              <input
                type="checkbox"
                checked={noWebsite}
                onChange={(event) => {
                  setNoWebsite(event.target.checked);
                  if (event.target.checked) {
                    save("website", null);
                  }
                }}
              />
              <span>Nous n’avons pas de site web</span>
            </label>
          </div>
        </section>

        <section className="content-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Activité</p>
              <h2>Votre activité en pratique</h2>
            </div>
          </div>
          <div className="form-grid">
            {card("description", "textarea", { wide: true, placeholder: "Votre activité en 2 ou 3 phrases." })}
            {card("source_of_funds", "select", { options: SOURCE_OF_FUNDS_OPTIONS })}
            {card("annual_revenue", "select", { options: REVENUE_OPTIONS })}
            {card("monthly_volume_usd", "number", { placeholder: "Ex. 25000" })}
            {card("operating_address", "address", { placeholder: "Si différente du siège" })}
            {card("account_purpose", "textarea", { wide: true, placeholder: "À quoi servira le compte ?" })}
          </div>
        </section>

        <section className="content-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Transmission de fonds</p>
              <h2>Transférez-vous des fonds pour le compte de clients ?</h2>
            </div>
          </div>
          <div className="radio-row">
            {[
              { value: false, label: "Non" },
              { value: true, label: "Oui" },
            ].map((option) => (
              <label className="checkbox-field" key={option.label}>
                <input
                  type="radio"
                  name="money_transmission"
                  checked={b.money_transmission.value === option.value}
                  onChange={() => save("money_transmission", option.value)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
          {b.money_transmission.value ? (
            <div className="form-grid money-transmission">
              {card("money_transmission_program", "textarea", {
                wide: true,
                placeholder: "Décrivez votre programme KYC/AML.",
              })}
              <p className="muted-copy form-field-wide">Un agrément de transmission de fonds sera demandé.</p>
            </div>
          ) : null}
        </section>
        {errors._ ? <p className="form-error">{errors._}</p> : null}
      </form>
      <StepFooter backHref={stepHref(id, "verifier")} nextHref={stepHref(id, "recap")} />
    </>
  );
}

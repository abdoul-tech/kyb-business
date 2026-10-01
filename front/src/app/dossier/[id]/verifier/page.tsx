"use client";

import {
  bridgeEntityTypeValues,
  businessFieldLabelsFr,
  businessFieldSchemas,
  LOW_CONFIDENCE_THRESHOLD,
  type BusinessFieldKey,
} from "@kyb/shared";
import { AlertList } from "@/components/dossier/AlertList";
import { AddUboForm, UboCard } from "@/components/dossier/UboCard";
import { FieldCard, type FieldKind } from "@/components/fields/FieldCard";
import { useDossier } from "@/components/layout/DossierShell";
import { PageIntro } from "@/components/layout/PageIntro";
import { StepFooter } from "@/components/layout/StepFooter";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useBusinessAutosave, useUboAutosave } from "@/lib/autosave";
import { sourceLabel } from "@/lib/labels";
import { stepHref } from "@/lib/navigation";

// Champs issus des documents (section Formation de Bridge).
const COMPANY_FIELDS: Array<{ key: BusinessFieldKey; kind: FieldKind; wide?: boolean; placeholder?: string }> = [
  { key: "legal_name", kind: "text", wide: true },
  { key: "legal_form_local", kind: "text", placeholder: "Mention « Forme juridique »" },
  { key: "entity_type", kind: "select" },
  { key: "registration_number", kind: "text" },
  { key: "incorporation_date", kind: "date" },
  { key: "country", kind: "text", placeholder: "SEN, NER, CIV…" },
  { key: "tax_id", kind: "text" },
  { key: "registered_address", kind: "address", wide: true },
  { key: "activity", kind: "textarea", wide: true },
  { key: "share_capital", kind: "capital" },
];

const ENTITY_TYPE_OPTIONS = bridgeEntityTypeValues.map((value) => ({ value, label: value }));

export default function VerifyPage() {
  const { id, view } = useDossier();
  const business = useBusinessAutosave(id);
  const ubos = useUboAutosave(id);
  const sourceOf = (docId: string | null) => sourceLabel(view, docId);

  const fields = COMPANY_FIELDS.map(({ key }) => view.business[key]);
  const toReview = fields.filter(
    (f) => !f.edited_by_user && (f.conflict || (f.value !== null && f.confidence < LOW_CONFIDENCE_THRESHOLD)),
  ).length;
  const missing = fields.filter((f) => f.value === null && !f.edited_by_user).length;
  const found = fields.length - missing;
  const processing = view.processing_documents;

  return (
    <>
      <PageIntro
        eyebrow="Étape 02 / 04"
        title="Vérifiez les informations extraites."
        description="Nous avons préparé votre dossier à partir de vos documents. Corrigez ce qui est inexact : vos modifications sont enregistrées automatiquement et ne seront jamais remplacées."
        aside={
          <div className="review-score">
            <span>Informations trouvées</span>
            <strong>
              {found} / {fields.length}
            </strong>
            <div className="score-bar">
              <span style={{ width: `${(found / fields.length) * 100}%` }} />
            </div>
          </div>
        }
      />
      {processing > 0 ? (
        <p className="processing-banner">
          {processing} document(s) en cours d’analyse : les informations se complètent automatiquement.
        </p>
      ) : null}
      <div className="verify-grid">
        <div className="verify-sections">
          <section className="content-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Formation</p>
                <h2>Entreprise</h2>
              </div>
              {toReview > 0 ? (
                <StatusBadge tone="warning">{`${toReview} à vérifier`}</StatusBadge>
              ) : (
                <StatusBadge tone="success">{`${found} champs trouvés`}</StatusBadge>
              )}
            </div>
            <div className="field-grid">
              {COMPANY_FIELDS.map(({ key, kind, wide, placeholder }) => (
                <FieldCard
                  key={key}
                  label={businessFieldLabelsFr[key]}
                  field={view.business[key]}
                  kind={kind}
                  wide={wide}
                  placeholder={placeholder}
                  options={key === "entity_type" ? ENTITY_TYPE_OPTIONS : undefined}
                  schema={businessFieldSchemas[key]}
                  sourceOf={sourceOf}
                  error={business.errors[key]}
                  onSave={(value) => business.save(key, value as never)}
                  onRevert={() => business.revert(key)}
                />
              ))}
            </div>
            {business.errors._ ? <p className="form-error">{business.errors._}</p> : null}
          </section>

          <section className="content-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">UBO information</p>
                <h2>Associés et dirigeants</h2>
              </div>
              <StatusBadge tone="neutral">{`${view.ubos.length} personne(s)`}</StatusBadge>
            </div>
            {view.ubos.length === 0 ? (
              <p className="muted-copy">
                Aucune personne trouvée pour l’instant : elles apparaîtront à la lecture des statuts, de l’extrait RCCM
                et des pièces d’identité.
              </p>
            ) : null}
            <div className="ubo-list">
              {view.ubos.map((ubo) => (
                <UboCard key={ubo.id} applicationId={id} view={view} ubo={ubo} autosave={ubos} />
              ))}
            </div>
            <AddUboForm applicationId={id} />
          </section>
        </div>
        <aside className="alert-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Contrôles</p>
              <h2>Points d’attention</h2>
            </div>
          </div>
          <AlertList alerts={view.alerts} />
          <p className="muted-copy panel-note">
            Les champs surlignés ont une confiance inférieure à 80 % ou des valeurs différentes selon les documents.
          </p>
        </aside>
      </div>
      <StepFooter backHref={stepHref(id, "documents")} nextHref={stepHref(id, "completer")} />
    </>
  );
}

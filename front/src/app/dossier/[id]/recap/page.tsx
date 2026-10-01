"use client";

import { documentTypeCatalog, type BridgeSection, type StoredDocument } from "@kyb/shared";
import { AlertList } from "@/components/dossier/AlertList";
import { useDossier } from "@/components/layout/DossierShell";
import { PageIntro } from "@/components/layout/PageIntro";
import { StepFooter } from "@/components/layout/StepFooter";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { documentStatusLabel, documentTypeLabel } from "@/lib/labels";
import { stepHref } from "@/lib/navigation";

const SECTION_LABELS: Record<BridgeSection, string> = {
  formation: "Documents de constitution",
  ownership: "Répartition du capital",
  ubo: "Identité des UBO et dirigeants",
  good_standing: "Bonne situation",
  proof_of_address: "Justificatif d’adresse",
  business_activity: "Preuve d’activité",
  licensure: "Licence ou exemption",
  additional: "Documents complémentaires",
};

type SectionState = "ready" | "processing" | "action" | "failed" | "empty";

const SECTION_STATE: Record<Exclude<SectionState, "empty">, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  ready: { label: "Prêt", tone: "success" },
  processing: { label: "Analyse en cours", tone: "neutral" },
  action: { label: "Type à confirmer", tone: "warning" },
  failed: { label: "Erreur", tone: "danger" },
};

// Une section est prête dès qu'un de ses documents est lu : l'échec d'une autre pièce (ex. certificat fiscal pas
// encore pris en charge) ne doit pas masquer un extrait RCCM valide.
function sectionState(docs: StoredDocument[]): SectionState {
  if (docs.length === 0) return "empty";
  if (docs.some((doc) => doc.status === "extracted")) return "ready";
  if (docs.some((doc) => ["uploaded", "classifying", "extracting"].includes(doc.status))) return "processing";
  if (docs.some((doc) => doc.status === "needs_type_confirmation")) return "action";
  return "failed";
}

export default function RecapPage() {
  const { id, view } = useDossier();
  const sections = Object.keys(SECTION_LABELS) as BridgeSection[];

  return (
    <>
      <PageIntro
        eyebrow="Étape 04 / 04"
        title="Vue d’ensemble de votre dossier."
        description="Les pièces reçues par section et les points d’attention. Le contrôle complet des pièces exigées et la soumission arrivent dans une prochaine version."
      />
      <div className="summary-grid">
        <div className="summary-main">
          <section className="content-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Documents</p>
                <h2>Pièces fournies par section</h2>
              </div>
              <StatusBadge tone="neutral">{`${view.documents.length} reçue(s)`}</StatusBadge>
            </div>
            <div className="requirements-list">
              {sections.map((section) => {
                const docs = view.documents.filter((doc) =>
                  (doc.type ? documentTypeCatalog[doc.type].bridge_sections : doc.bridge_sections).includes(section),
                );
                const state = sectionState(docs);
                return (
                  <div className={`requirement-row ${state === "empty" ? "missing-soft" : ""} ${state === "failed" ? "missing" : ""}`} key={section}>
                    <span className="check-mark">{state === "ready" ? "✓" : state === "empty" ? "·" : "!"}</span>
                    <div>
                      <strong>{SECTION_LABELS[section]}</strong>
                      <span>
                        {docs.length > 0
                          ? docs
                              .map(
                                (doc) =>
                                  `${documentTypeLabel(doc.type)} (${doc.original_filename})${
                                    doc.status === "extracted" ? "" : ` — ${documentStatusLabel[doc.status].toLowerCase()}`
                                  }`,
                              )
                              .join(" · ")
                          : "Aucune pièce pour l’instant"}
                      </span>
                    </div>
                    {state !== "empty" ? (
                      <StatusBadge tone={SECTION_STATE[state].tone}>{SECTION_STATE[state].label}</StatusBadge>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
          <section className="content-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Personnes</p>
                <h2>Associés et dirigeants</h2>
              </div>
            </div>
            <div className="requirements-list">
              {view.ubos.map((ubo) => (
                <div className="requirement-row" key={ubo.id}>
                  <span className="check-mark">{ubo.id_document_id ? "✓" : "!"}</span>
                  <div>
                    <strong>{ubo.full_name.value ?? "Personne sans nom"}</strong>
                    <span>
                      {[ubo.role.value, ubo.ownership_pct.value !== null ? `${ubo.ownership_pct.value} %` : null]
                        .filter(Boolean)
                        .join(" · ") || "Fonction et part à compléter"}
                      {ubo.attests_ownership ? " · signe l’attestation" : ""}
                    </span>
                  </div>
                  <StatusBadge tone={ubo.id_document_id ? "success" : "warning"}>
                    {ubo.id_document_id ? "Pièce d’identité" : "Pièce à fournir"}
                  </StatusBadge>
                </div>
              ))}
              {view.ubos.length === 0 ? <p className="muted-copy">Aucune personne pour l’instant.</p> : null}
            </div>
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
          <div className="submit-box">
            <span>La soumission sera disponible avec les contrôles KYB complets.</span>
            <button type="button" className="button button-primary" disabled>
              Soumettre le dossier
            </button>
          </div>
        </aside>
      </div>
      <StepFooter backHref={stepHref(id, "completer")} />
    </>
  );
}

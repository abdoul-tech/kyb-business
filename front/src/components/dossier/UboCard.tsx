"use client";

import { uboFieldLabelsFr, uboFieldSchemas, type ApplicationView, type UboFieldKey, type UboView } from "@kyb/shared";
import { useState } from "react";
import { FieldCard, type FieldKind } from "@/components/fields/FieldCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useUboAutosave } from "@/lib/autosave";
import { displayValue, sourceLabel } from "@/lib/labels";
import { useUboMutations } from "@/lib/queries";

const UBO_FIELDS: Array<{ key: UboFieldKey; kind: FieldKind; wide?: boolean }> = [
  { key: "full_name", kind: "text", wide: true },
  { key: "role", kind: "text" },
  { key: "ownership_pct", kind: "number" },
  { key: "dob", kind: "date" },
  { key: "nationality", kind: "text" },
  { key: "address", kind: "text", wide: true },
];

export function UboCard({
  applicationId,
  view,
  ubo,
  autosave,
}: {
  applicationId: string;
  view: ApplicationView;
  ubo: UboView;
  autosave: ReturnType<typeof useUboAutosave>;
}) {
  const { update, remove } = useUboMutations(applicationId);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const errors = autosave.errors[ubo.id] ?? {};
  const idDocuments = view.documents.filter((doc) => doc.type === "id_document");
  const sourceOf = (docId: string | null) => sourceLabel(view, docId);
  const mutationError = update.error ?? remove.error;

  return (
    <article className="ubo-card">
      <header className="ubo-card-header">
        <div>
          <h3>{ubo.full_name.value ?? "Personne sans nom"}</h3>
          <div className="ubo-badges">
            {ubo.is_ubo ? <StatusBadge tone="success">UBO · 25 % ou plus</StatusBadge> : null}
            {ubo.is_control_person ? <StatusBadge tone="success">Direction</StatusBadge> : null}
            {ubo.added_by_user ? <StatusBadge tone="neutral">Ajouté par vous</StatusBadge> : null}
            {!ubo.is_ubo && !ubo.is_control_person ? (
              <StatusBadge tone="neutral">Ni UBO ni dirigeant</StatusBadge>
            ) : null}
          </div>
        </div>
        {confirmRemove ? (
          <span className="remove-confirm">
            <button type="button" className="link-button danger" onClick={() => remove.mutate(ubo.id)} disabled={remove.isPending}>
              Confirmer le retrait
            </button>
            <button type="button" className="link-button" onClick={() => setConfirmRemove(false)}>
              Annuler
            </button>
          </span>
        ) : (
          <button type="button" className="link-button" onClick={() => setConfirmRemove(true)}>
            Retirer
          </button>
        )}
      </header>

      <div className="field-grid">
        {UBO_FIELDS.map(({ key, kind, wide }) => (
          <FieldCard
            key={key}
            label={uboFieldLabelsFr[key]}
            field={ubo[key]}
            kind={kind}
            wide={wide}
            schema={uboFieldSchemas[key]}
            sourceOf={sourceOf}
            error={errors[key]}
            onSave={(value) => autosave.save(ubo.id, key, value as never)}
            onRevert={ubo.added_by_user ? undefined : () => autosave.revert(ubo.id, key)}
          />
        ))}
      </div>

      <div className="ubo-footer">
        <label className="form-field">
          <span>Pièce d’identité</span>
          <select
            value={ubo.id_document_id ?? ""}
            onChange={(e) => update.mutate({ uboId: ubo.id, body: { id_document_id: e.target.value || null } })}
          >
            <option value="">Aucune pièce rattachée</option>
            {idDocuments.map((doc) => (
              <option key={doc.id} value={doc.id}>
                {doc.original_filename}
              </option>
            ))}
          </select>
          <small className="field-source">
            {ubo.id_document_id
              ? `Expire le ${displayValue(ubo.id_expiry.value)}`
              : "Ajoutez son passeport ou sa CNI à l’étape Documents."}
          </small>
        </label>
        <label className={`checkbox-field ${ubo.is_control_person ? "" : "checkbox-disabled"}`}>
          <input
            type="radio"
            name="attests_ownership"
            checked={ubo.attests_ownership}
            disabled={!ubo.is_control_person || update.isPending}
            onChange={() => update.mutate({ uboId: ubo.id, body: { attests_ownership: true } })}
          />
          <span>
            Signe l’attestation de propriété
            {!ubo.is_control_person ? " (réservé à une personne de direction)" : ""}
          </span>
        </label>
      </div>
      {errors._ || mutationError ? <p className="form-error">{errors._ ?? mutationError?.message}</p> : null}
    </article>
  );
}

export function AddUboForm({ applicationId }: { applicationId: string }) {
  const { add } = useUboMutations(applicationId);
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("");
  const [pct, setPct] = useState("");

  if (!open) {
    return (
      <button type="button" className="button button-secondary" onClick={() => setOpen(true)}>
        + Ajouter une personne
      </button>
    );
  }

  const ownership = pct.trim() === "" ? null : Number(pct.replace(",", "."));
  const valid = fullName.trim().length > 0 && (ownership === null || (ownership >= 0 && ownership <= 100));

  return (
    <form
      className="add-ubo-form"
      onSubmit={(event) => {
        event.preventDefault();
        add.mutate(
          { full_name: fullName.trim(), role: role.trim() || null, ownership_pct: ownership },
          {
            onSuccess: () => {
              setOpen(false);
              setFullName("");
              setRole("");
              setPct("");
            },
          },
        );
      }}
    >
      <p className="muted-copy">
        Ajoutez toute personne détenant 25 % ou plus, ou ayant un rôle de direction, absente de vos documents.
      </p>
      <div className="form-grid">
        <label className="form-field form-field-wide">
          <span>Nom complet</span>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </label>
        <label className="form-field">
          <span>Fonction</span>
          <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Gérant, DG, associé…" />
        </label>
        <label className="form-field">
          <span>Part du capital (%)</span>
          <input inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} />
        </label>
      </div>
      {add.error ? <p className="form-error">{add.error.message}</p> : null}
      <div className="form-actions">
        <button type="button" className="button button-quiet" onClick={() => setOpen(false)}>
          Annuler
        </button>
        <button type="submit" className="button button-primary" disabled={!valid || add.isPending}>
          Ajouter
        </button>
      </div>
    </form>
  );
}

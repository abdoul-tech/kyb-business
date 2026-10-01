"use client";

import { LOW_CONFIDENCE_THRESHOLD, type Field } from "@kyb/shared";
import { useEffect, useId, useRef, useState } from "react";
import type { z } from "zod";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { displayValue } from "@/lib/labels";

export type FieldKind =
  | "text"
  | "textarea"
  | "date"
  | "number"
  | "select"
  | "address"
  | "capital"
  | "email"
  | "tel"
  | "url";

type Option = { value: string; label: string };

type FieldCardProps = {
  label: string;
  field: Field<unknown>;
  kind?: FieldKind;
  options?: Option[];
  // Schéma partagé avec le back : la valeur n'est enregistrée que si elle est valide.
  schema?: z.ZodType;
  placeholder?: string;
  wide?: boolean;
  // Libellé du document source (« Extrait RCCM / registre du commerce »), null si inconnu.
  sourceOf?: (docId: string | null) => string | null;
  // Champ toujours saisi par le client : pas de ligne « source » ni de badge d'extraction.
  clientOnly?: boolean;
  error?: string;
  disabled?: boolean;
  onSave: (value: unknown) => void;
  // Supprime la saisie du client pour revenir à la valeur des documents (champs issus des documents uniquement).
  onRevert?: () => void;
};

type Draft = { text: string; currency: string };

function toDraft(kind: FieldKind, value: unknown): Draft {
  if (value === null || value === undefined) {
    return { text: "", currency: "" };
  }
  if (kind === "address") {
    return { text: (value as { full_address: string }).full_address, currency: "" };
  }
  if (kind === "capital") {
    const capital = value as { amount: number; currency: string };
    return { text: String(capital.amount), currency: capital.currency };
  }
  return { text: String(value), currency: "" };
}

function fromDraft(kind: FieldKind, draft: Draft): { value: unknown } | { error: string } {
  const text = draft.text.trim();
  if (text === "") {
    return { value: null };
  }
  switch (kind) {
    case "address":
      return { value: { full_address: text, raw_components: null } };
    case "number": {
      const number = Number(text.replace(/\s/g, "").replace(",", "."));
      return Number.isFinite(number) ? { value: number } : { error: "Nombre attendu." };
    }
    case "capital": {
      const amount = Number(text.replace(/\s/g, ""));
      if (!Number.isInteger(amount)) {
        return { error: "Montant entier attendu." };
      }
      return { value: { amount, currency: draft.currency.trim().toUpperCase() } };
    }
    default:
      return { value: text };
  }
}

function validate(schema: z.ZodType | undefined, value: unknown): string | null {
  if (!schema || value === null) {
    return null;
  }
  const result = schema.safeParse(value);
  return result.success ? null : (result.error.issues[0]?.message ?? "Valeur invalide.");
}

export function FieldCard({
  label,
  field,
  kind = "text",
  options = [],
  schema,
  placeholder,
  wide,
  sourceOf,
  clientOnly,
  error,
  disabled,
  onSave,
  onRevert,
}: FieldCardProps) {
  const inputId = useId();
  const serverDraft = toDraft(kind, field.value);
  const [draft, setDraft] = useState<Draft>(serverDraft);
  const [localError, setLocalError] = useState<string | null>(null);
  const focused = useRef(false);
  const serverKey = JSON.stringify(serverDraft);

  // Resynchronise avec le serveur (ex. téléphone normalisé en E.164) sauf pendant la saisie.
  useEffect(() => {
    if (!focused.current) {
      setDraft(JSON.parse(serverKey) as Draft);
    }
  }, [serverKey]);

  function commit(next: Draft, showError: boolean) {
    const parsed = fromDraft(kind, next);
    const problem = "error" in parsed ? parsed.error : validate(schema, parsed.value);
    if (problem) {
      if (showError) {
        setLocalError(problem);
      }
      return;
    }
    setLocalError(null);
    const value = (parsed as { value: unknown }).value;
    // N'enregistre que ce qui a changé : sinon, quitter un champ extrait sans le modifier le marquerait
    // « saisi par le client » et le protégerait à tort de toute extraction ultérieure.
    if (JSON.stringify(toDraft(kind, value)) !== serverKey) {
      onSave(value);
    }
  }

  function change(next: Draft, immediate = false) {
    setDraft(next);
    if (localError) {
      setLocalError(null);
    }
    commit(next, immediate);
  }

  const needsReview =
    !clientOnly && !field.edited_by_user && field.value !== null && field.confidence < LOW_CONFIDENCE_THRESHOLD;
  const missing = !field.edited_by_user && field.value === null;
  const shownError = localError ?? error;
  const source = sourceOf?.(field.source_doc_id) ?? null;

  const common = {
    id: inputId,
    disabled,
    placeholder,
    "aria-invalid": shownError ? true : undefined,
    onFocus: () => {
      focused.current = true;
    },
    onBlur: () => {
      focused.current = false;
      commit(draft, true);
    },
  };

  return (
    <div
      className={`field-card ${wide ? "form-field-wide" : ""} ${needsReview || field.conflict ? "field-needs-review" : ""}`}
    >
      <label className="field-label" htmlFor={inputId}>
        <span>{label}</span>
        <span className="field-badges">
          {field.conflict ? <StatusBadge tone="warning">Conflit</StatusBadge> : null}
          {needsReview && !field.conflict ? <StatusBadge tone="warning">À vérifier</StatusBadge> : null}
          {!clientOnly && missing ? <StatusBadge tone="neutral">À compléter</StatusBadge> : null}
        </span>
      </label>

      {kind === "textarea" ? (
        <textarea rows={3} value={draft.text} onChange={(e) => change({ ...draft, text: e.target.value })} {...common} />
      ) : kind === "select" ? (
        <select value={draft.text} onChange={(e) => change({ ...draft, text: e.target.value }, true)} {...common}>
          <option value="">Choisir…</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : kind === "capital" ? (
        <span className="capital-inputs">
          <input
            inputMode="numeric"
            value={draft.text}
            onChange={(e) => change({ ...draft, text: e.target.value })}
            {...common}
          />
          <input
            aria-label={`${label} — devise`}
            className="currency-input"
            value={draft.currency}
            placeholder="XOF"
            maxLength={3}
            disabled={disabled}
            onChange={(e) => change({ ...draft, currency: e.target.value })}
            onBlur={() => commit(draft, true)}
          />
        </span>
      ) : (
        <input
          type={kind === "date" ? "date" : kind === "email" ? "email" : kind === "tel" ? "tel" : kind === "url" ? "url" : "text"}
          inputMode={kind === "number" ? "decimal" : undefined}
          value={draft.text}
          onChange={(e) => change({ ...draft, text: e.target.value }, kind === "date")}
          {...common}
        />
      )}

      {shownError ? <small className="form-error">{shownError}</small> : null}

      {!clientOnly ? (
        <span className="field-source">
          {field.edited_by_user ? (
            "Saisi par vous"
          ) : field.derived_reason ? (
            `Déduit — ${field.derived_reason}`
          ) : source ? (
            <>
              Extrait de <strong>{source}</strong>
              {field.source_page ? `, p. ${field.source_page}` : ""} · {Math.round(field.confidence * 100)} %
            </>
          ) : (
            "Introuvable dans vos documents : à compléter"
          )}
        </span>
      ) : null}

      {field.edited_by_user && onRevert && !clientOnly ? (
        <button type="button" className="link-button revert-button" onClick={onRevert} disabled={disabled}>
          ↺ Revenir à la valeur des documents
          {field.candidates[0] ? ` (${displayValue(field.candidates[0].value)})` : ""}
        </button>
      ) : null}

      {field.conflict && !field.edited_by_user ? (
        <div className="candidates">
          <span>Vos documents divergent, retenez la bonne valeur :</span>
          {field.candidates.map((candidate, index) => (
            <button
              type="button"
              key={`${candidate.source_doc_id}-${index}`}
              onClick={() => onSave(candidate.value)}
              disabled={disabled}
            >
              <strong>{displayValue(candidate.value)}</strong>
              <em>
                {sourceOf?.(candidate.source_doc_id) ?? "Document"}
                {candidate.source_page ? `, p. ${candidate.source_page}` : ""}
              </em>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

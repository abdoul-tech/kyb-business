import {
  jaroWinkler,
  normalizeName,
  uboFieldKeys,
  type Field,
  type IdDocument,
  type MergeAlert,
  type UboFieldKey,
  type UboValues,
  type UboView,
} from "@kyb/shared";
import { isControlRole, UBO_OWNERSHIP_THRESHOLD } from "../rules/ownership.js";
import { emptyField, userField } from "./fields.js";
import { NAME_NEAR_MATCH_THRESHOLD, type MergeDocument } from "./ubo-matching.js";

type UserValue<T> = { value: T | null; edited_at: Date };

export type UserUboValues = { [K in UboFieldKey]?: UserValue<UboValues[K]> } & {
  id_document_id?: UserValue<string>;
};

// Ce que le client a fait sur les personnes, stocké dans le dossier (`applications.user_ubos`).
export type UserUbos = {
  // Corrections sur une personne détectée dans les documents, par identifiant ; `removed` la masque.
  overrides: Record<string, { values: UserUboValues; removed?: boolean }>;
  // Personnes ajoutées à la main.
  manual: Record<string, { values: UserUboValues; created_at: Date }>;
  // Spec : le control person qui signe l'attestation de propriété, désigné par le client.
  attesting_ubo_id: string | null;
};

export const EMPTY_USER_UBOS: UserUbos = { overrides: {}, manual: {}, attesting_ubo_id: null };

const UBO_FIELD_MAP = {
  full_name: "full_name",
  role: "role",
  ownership_pct: "ownership_pct",
  dob: "dob",
  nationality: "nationality",
  address: "address",
} as const satisfies Record<UboFieldKey, keyof UboView>;

// Pièce d'identité rattachée à la main : sa date d'expiration vient de son extraction.
function linkedIdDocument(documents: MergeDocument[], documentId: string): { id: string; expiry: Field<string> } {
  const doc = documents.find((d) => d.id === documentId && d.type === "id_document");
  const expiry = (doc?.data as IdDocument | undefined)?.expiry_date;
  if (!doc || !expiry?.value) {
    return { id: documentId, expiry: emptyField<string>() };
  }
  return {
    id: documentId,
    expiry: {
      value: expiry.value,
      confidence: expiry.confidence,
      source_doc_id: doc.id,
      source_page: expiry.source_page,
      edited_by_user: false,
      conflict: false,
      candidates: [
        { value: expiry.value, confidence: expiry.confidence, source_doc_id: doc.id, source_page: expiry.source_page },
      ],
    },
  };
}

function applyValues(
  base: UboView,
  values: UserUboValues,
  documents: MergeDocument[],
  attestingId: string | null,
): UboView {
  const ubo: UboView = { ...base };
  for (const key of uboFieldKeys) {
    const saved = values[key];
    if (saved) {
      const target = UBO_FIELD_MAP[key];
      (ubo as Record<string, unknown>)[target] = userField(saved.value, base[target] as Field<never>);
    }
  }

  if (values.id_document_id) {
    const linkedId = values.id_document_id.value;
    if (linkedId) {
      const linked = linkedIdDocument(documents, linkedId);
      ubo.id_document_id = linked.id;
      ubo.id_expiry = linked.expiry;
      ubo.source_doc_ids = [...new Set([...ubo.source_doc_ids, linked.id])];
    } else {
      ubo.id_document_id = null;
      ubo.id_expiry = emptyField<string>();
    }
  }

  // Indicateurs recalculés sur les valeurs finales (éventuellement corrigées par le client).
  ubo.is_ubo = (ubo.ownership_pct.value ?? 0) >= UBO_OWNERSHIP_THRESHOLD;
  ubo.is_control_person = values.role
    ? !!ubo.role.value && isControlRole(ubo.role.value)
    : base.is_control_person;
  ubo.attests_ownership = attestingId === ubo.id;
  return ubo;
}

function manualBase(id: string): UboView {
  return {
    id,
    full_name: emptyField(),
    role: emptyField(),
    ownership_pct: emptyField(),
    is_ubo: false,
    is_control_person: false,
    attests_ownership: false,
    dob: emptyField(),
    nationality: emptyField(),
    address: emptyField(),
    id_document_id: null,
    id_expiry: emptyField(),
    source_doc_ids: [],
    added_by_user: true,
  };
}

// Personne ajoutée à la main dont le nom ressemble à une personne détectée : le client doit vérifier
// qu'il ne l'a pas saisie en double.
function manualDuplicateAlerts(detected: UboView[], manual: UboView[]): MergeAlert[] {
  const alerts: MergeAlert[] = [];
  for (const added of manual) {
    const name = added.full_name.value;
    if (!name) {
      continue;
    }
    for (const other of detected) {
      const otherName = other.full_name.value;
      if (otherName && jaroWinkler(normalizeName(name), normalizeName(otherName)) >= NAME_NEAR_MATCH_THRESHOLD) {
        alerts.push({
          code: "ubo_possible_duplicate",
          severity: "warning",
          message_fr: `« ${name} » ressemble à « ${otherName} », déjà présent dans les documents : vérifiez qu'il ne s'agit pas d'un doublon.`,
          subject: { ubo_ids: [other.id, added.id] },
        });
      }
    }
  }
  return alerts;
}

export function applyUserUbos(
  detected: UboView[],
  detectedAlerts: MergeAlert[],
  user: UserUbos,
  documents: MergeDocument[],
): { ubos: UboView[]; alerts: MergeAlert[] } {
  const removed = new Set(
    Object.entries(user.overrides)
      .filter(([, override]) => override.removed)
      .map(([id]) => id),
  );

  const kept = detected
    .filter((ubo) => !removed.has(ubo.id))
    .map((ubo) => applyValues(ubo, user.overrides[ubo.id]?.values ?? {}, documents, user.attesting_ubo_id));

  const manual = Object.entries(user.manual)
    .sort(([, a], [, b]) => a.created_at.getTime() - b.created_at.getTime())
    .map(([id, entry]) => applyValues(manualBase(id), entry.values, documents, user.attesting_ubo_id));

  // Les alertes sur une personne retirée n'ont plus lieu d'être.
  const alerts = detectedAlerts.filter((alert) => !alert.subject.ubo_ids?.some((id) => removed.has(id)));

  return { ubos: [...kept, ...manual], alerts: [...alerts, ...manualDuplicateAlerts(kept, manual)] };
}

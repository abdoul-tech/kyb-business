import {
  businessFieldKeys,
  mapLegalForm,
  type Address,
  type BridgeEntityType,
  type BusinessFieldKey,
  type BusinessValues,
  type DocumentTypeSlug,
  type Field,
  type MergeAlert,
  type Rccm,
  type ShareCapital,
  type Statuts,
  type TaxCertificate,
  type UboView,
} from "@kyb/shared";
import {
  candidateFrom,
  defaultField,
  emptyField,
  resolveField,
  sameAfterNormalization,
  userField,
  type ResolveOptions,
  type SourcedCandidate,
} from "./fields.js";
import { matchUbos, type MergeDocument } from "./ubo-matching.js";

export type { MergeDocument } from "./ubo-matching.js";

// Valeurs saisies par le client, stockées dans le dossier (jamais écrasées par une extraction).
export type UserBusinessValues = { [K in BusinessFieldKey]?: { value: BusinessValues[K] | null; edited_at: Date } };

export type BusinessFields = { [K in BusinessFieldKey]: Field<BusinessValues[K]> };

export type MergedApplication = {
  business: BusinessFields;
  ubos: UboView[];
  alerts: MergeAlert[];
};

// Spec, « Fusion des champs entre documents » : priorité des sources par champ.
// rccm_modificatif (le plus récent) passera en tête pour l'activité quand son extraction existera (J4).
export const BUSINESS_PRIORITY = {
  legal_name: ["rccm", "statuts", "tax_certificate"],
  legal_form_local: ["statuts", "rccm"],
  incorporation_date: ["rccm", "statuts"],
  registration_number: ["rccm"],
  tax_id: ["tax_certificate", "rccm"],
  country: ["rccm"],
  registered_address: ["rccm", "statuts", "tax_certificate"],
  activity: ["rccm_modificatif", "rccm", "statuts"],
  share_capital: ["rccm", "statuts"],
} as const satisfies Partial<Record<BusinessFieldKey, readonly DocumentTypeSlug[]>>;

// Libellés des champs dans les messages au client.
export const BUSINESS_FIELD_LABELS_FR: Record<BusinessFieldKey, string> = {
  legal_name: "Dénomination sociale",
  entity_type: "Forme juridique (Bridge)",
  legal_form_local: "Forme juridique",
  incorporation_date: "Date d'immatriculation",
  registration_number: "Numéro RCCM",
  tax_id: "Numéro d'identification fiscale",
  country: "Pays d'immatriculation",
  registered_address: "Adresse du siège",
  operating_address: "Adresse d'exploitation",
  activity: "Activité",
  share_capital: "Capital social",
  email: "Email",
  phone: "Téléphone",
  website: "Site web",
  no_website_explanation: "Comment vos clients vous trouvent",
  description: "Description de l'activité",
  naics: "Code NAICS",
  source_of_funds: "Origine des fonds",
  annual_revenue: "Chiffre d'affaires annuel",
  monthly_volume_usd: "Volume mensuel (USD)",
  money_transmission: "Transmission de fonds pour des clients",
  money_transmission_program: "Programme KYC/AML",
  account_purpose: "Usage du compte",
  dao: "DAO",
};

type Candidates = { [K in keyof typeof BUSINESS_PRIORITY]: SourcedCandidate<BusinessValues[K]>[] };

const RESOLVE_OPTIONS: { [K in keyof typeof BUSINESS_PRIORITY]?: ResolveOptions<BusinessValues[K]> } = {
  // Même adresse si le texte complet est le même, quel que soit le découpage en éléments.
  registered_address: { same: (a, b) => sameAfterNormalization(a.full_address, b.full_address) },
  // L'objet social des statuts n'est qu'un repli, toujours rédigé autrement que l'activité du RCCM :
  // on ne compare que des sources du même type.
  activity: { comparable: (a, b) => a.source_type === b.source_type },
};

function capital(amount: { value: number | null; confidence: number; source_page: number | null }, currency: {
  value: string | null;
  confidence: number;
}) {
  if (amount.value === null) {
    return null;
  }
  return {
    value: { amount: amount.value, currency: currency.value ?? "" } satisfies ShareCapital,
    confidence: currency.value ? Math.min(amount.confidence, currency.confidence) : amount.confidence,
    source_page: amount.source_page,
  };
}

function collectCandidates(documents: MergeDocument[]): Candidates {
  const c: Candidates = {
    legal_name: [],
    legal_form_local: [],
    incorporation_date: [],
    registration_number: [],
    tax_id: [],
    country: [],
    registered_address: [],
    activity: [],
    share_capital: [],
  };

  for (const doc of documents) {
    switch (doc.type) {
      case "rccm": {
        const d = doc.data as Rccm;
        c.legal_name.push(...candidateFrom(doc, d.legal_name));
        c.legal_form_local.push(...candidateFrom(doc, d.legal_form_explicit));
        c.incorporation_date.push(...candidateFrom(doc, d.registration_date));
        c.registration_number.push(...candidateFrom(doc, d.rccm_number));
        c.country.push(...candidateFrom(doc, d.country));
        c.registered_address.push(...candidateFrom<Address>(doc, d.registered_address));
        c.activity.push(...candidateFrom(doc, d.activity));
        c.share_capital.push(...candidateFrom(doc, capital(d.capital_amount, d.capital_currency)));
        break;
      }
      case "statuts": {
        const d = doc.data as Statuts;
        c.legal_name.push(...candidateFrom(doc, d.legal_name));
        c.legal_form_local.push(...candidateFrom(doc, d.legal_form_explicit));
        c.registered_address.push(...candidateFrom<Address>(doc, d.registered_address));
        // Les statuts n'ont pas d'activité distincte : l'objet social en tient lieu.
        c.activity.push(...candidateFrom(doc, d.object));
        c.share_capital.push(...candidateFrom(doc, capital(d.capital_amount, d.capital_currency)));
        break;
      }
      case "tax_certificate": {
        const d = doc.data as TaxCertificate;
        c.legal_name.push(...candidateFrom(doc, d.legal_name));
        c.tax_id.push(...candidateFrom(doc, d.tax_id));
        c.registered_address.push(...candidateFrom<Address>(doc, d.registered_address));
        break;
      }
    }
  }
  return c;
}

// La forme juridique Bridge se déduit de la forme locale (Annexe A) ; sans correspondance, elle reste vide.
function entityTypeFrom(legalForm: Field<string>): Field<BridgeEntityType> {
  const mapped = legalForm.value ? mapLegalForm(legalForm.value) : null;
  const candidates = legalForm.candidates.flatMap((candidate) => {
    const value = mapLegalForm(candidate.value);
    return value ? [{ ...candidate, value }] : [];
  });
  if (!mapped) {
    return { ...emptyField<BridgeEntityType>(), candidates };
  }
  return {
    value: mapped,
    confidence: legalForm.confidence,
    source_doc_id: legalForm.source_doc_id,
    source_page: legalForm.source_page,
    edited_by_user: legalForm.edited_by_user,
    // Deux formes locales différentes mais équivalentes pour Bridge (SARL / société à responsabilité limitée)
    // ne sont pas un conflit.
    conflict: candidates.some((candidate) => candidate.value !== mapped),
    candidates,
  };
}

function withUserValue<K extends BusinessFieldKey>(
  key: K,
  extracted: Field<BusinessValues[K]>,
  user: UserBusinessValues,
): Field<BusinessValues[K]> {
  const saved = user[key];
  return saved ? userField(saved.value as BusinessValues[K] | null, extracted) : extracted;
}

export function mergeBusiness(documents: MergeDocument[], user: UserBusinessValues = {}): BusinessFields {
  const c = collectCandidates(documents);
  const extracted: Partial<{ [K in BusinessFieldKey]: Field<BusinessValues[K]> }> = {};

  for (const key of Object.keys(BUSINESS_PRIORITY) as Array<keyof typeof BUSINESS_PRIORITY>) {
    (extracted as Record<string, unknown>)[key] = resolveField(
      c[key] as SourcedCandidate<unknown>[],
      BUSINESS_PRIORITY[key],
      RESOLVE_OPTIONS[key] as ResolveOptions<unknown> | undefined,
    );
  }

  const business = {} as BusinessFields;
  for (const key of businessFieldKeys) {
    let base = (extracted[key] ?? emptyField()) as Field<never>;
    if (key === "dao" || key === "money_transmission") {
      // Spec : « No par défaut », « Non par défaut ».
      base = defaultField(false) as Field<never>;
    }
    (business as Record<string, unknown>)[key] = withUserValue(key, base, user);
  }

  // Calculée après la forme locale finale (éventuellement corrigée par le client), sauf saisie directe.
  if (!user.entity_type) {
    business.entity_type = entityTypeFrom(business.legal_form_local);
  }
  return business;
}

export function conflictAlerts(business: BusinessFields, ubos: UboView[]): MergeAlert[] {
  const alerts: MergeAlert[] = [];
  for (const key of businessFieldKeys) {
    if (business[key].conflict) {
      alerts.push({
        code: "field_conflict",
        severity: "warning",
        message_fr: `Les documents donnent des valeurs différentes pour « ${BUSINESS_FIELD_LABELS_FR[key]} » : choisissez la bonne.`,
        subject: { field: `business.${key}` },
      });
    }
  }
  const uboFields = { full_name: "Nom", role: "Fonction", ownership_pct: "Détention", dob: "Date de naissance", nationality: "Nationalité", address: "Adresse", id_expiry: "Expiration de la pièce" } as const;
  for (const ubo of ubos) {
    for (const [key, label] of Object.entries(uboFields) as Array<[keyof typeof uboFields, string]>) {
      if (ubo[key].conflict) {
        alerts.push({
          code: "field_conflict",
          severity: "warning",
          message_fr: `Les documents donnent des valeurs différentes pour « ${label} » de ${ubo.full_name.value ?? "une personne"} : choisissez la bonne.`,
          subject: { field: `ubos.${ubo.id}.${key}`, ubo_ids: [ubo.id] },
        });
      }
    }
  }
  return alerts;
}

// Fusion complète : recalculée à chaque lecture depuis les extractions (déchiffrées) et les saisies du client.
export function mergeApplication(documents: MergeDocument[], user: UserBusinessValues = {}): MergedApplication {
  const business = mergeBusiness(documents, user);
  const { ubos, alerts: uboAlerts } = matchUbos(documents);
  return { business, ubos, alerts: [...conflictAlerts(business, ubos), ...uboAlerts] };
}

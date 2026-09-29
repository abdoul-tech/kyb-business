import { foldText, type DocumentTypeSlug, type Field, type FieldCandidate } from "@kyb/shared";

// Confiance maximale d'un champ quand deux documents se contredisent (spec, règle de fusion 3).
export const CONFLICT_CONFIDENCE_CAP = 0.5;

// Candidat d'un champ, avec ce qu'il faut pour le départager : type et date du document source.
export type SourcedCandidate<T> = FieldCandidate<T> & {
  source_type: DocumentTypeSlug;
  uploaded_at: Date;
};

type Extracted<T> = { value: T | null; confidence: number; source_page: number | null } | undefined | null;

export type SourceDocument = {
  id: string;
  type: DocumentTypeSlug;
  uploaded_at: Date;
};

// Transforme un champ extrait en candidat (aucun candidat si la valeur est vide).
export function candidateFrom<T, U = T>(
  doc: SourceDocument,
  extracted: Extracted<T>,
  map?: (value: T) => U | null,
): SourcedCandidate<U>[] {
  if (!extracted || extracted.value === null || extracted.value === undefined) {
    return [];
  }
  const value = map ? map(extracted.value) : (extracted.value as unknown as U);
  if (value === null || value === undefined) {
    return [];
  }
  return [
    {
      value,
      confidence: extracted.confidence,
      source_doc_id: doc.id,
      source_page: extracted.source_page,
      source_type: doc.type,
      uploaded_at: doc.uploaded_at,
    },
  ];
}

function canonical(value: unknown): unknown {
  if (typeof value === "string") {
    return foldText(value);
  }
  if (Array.isArray(value)) {
    return value.map(canonical);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return value;
}

// Deux valeurs sont « les mêmes » après normalisation : casse, accents et ponctuation ignorés.
export function sameAfterNormalization(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

export function emptyField<T>(): Field<T> {
  return {
    value: null,
    confidence: 0,
    source_doc_id: null,
    source_page: null,
    edited_by_user: false,
    conflict: false,
    candidates: [],
  };
}

// Valeur par défaut de la spec (ex. DAO = No, transmission de fonds = Non) : ni extraite ni saisie.
export function defaultField<T>(value: T): Field<T> {
  return { ...emptyField<T>(), value, confidence: 1 };
}

function stripSource<T>({ value, confidence, source_doc_id, source_page }: SourcedCandidate<T>): FieldCandidate<T> {
  return { value, confidence, source_doc_id, source_page };
}

// Spec, règles de fusion 2 et 3 : priorité de source par champ, puis confiance la plus haute, puis document
// le plus récent. Si des candidats diffèrent après normalisation, la confiance est plafonnée et le champ
// est marqué en conflit : le client tranche.
export type ResolveOptions<T> = {
  // Égalité après normalisation (par défaut : casse, accents et ponctuation ignorés).
  same?: (a: T, b: T) => boolean;
  // Candidats comparables à la valeur retenue pour détecter un conflit (par défaut : tous). Sert quand une
  // source n'est qu'un repli rédigé autrement (ex. objet social des statuts face à l'activité du RCCM).
  comparable?: (a: SourcedCandidate<T>, b: SourcedCandidate<T>) => boolean;
};

export function resolveField<T>(
  candidates: SourcedCandidate<T>[],
  priority: readonly DocumentTypeSlug[],
  options: ResolveOptions<T> = {},
): Field<T> {
  const same = options.same ?? sameAfterNormalization;
  const comparable = options.comparable ?? (() => true);
  const ranked = candidates
    .filter((candidate) => priority.includes(candidate.source_type))
    .sort(
      (a, b) =>
        priority.indexOf(a.source_type) - priority.indexOf(b.source_type) ||
        b.confidence - a.confidence ||
        b.uploaded_at.getTime() - a.uploaded_at.getTime(),
    );

  const chosen = ranked[0];
  if (!chosen) {
    return emptyField<T>();
  }

  const conflict = ranked.some(
    (candidate) => comparable(candidate, chosen) && !same(candidate.value, chosen.value),
  );
  return {
    value: chosen.value,
    confidence: conflict ? Math.min(chosen.confidence, CONFLICT_CONFIDENCE_CAP) : chosen.confidence,
    source_doc_id: chosen.source_doc_id,
    source_page: chosen.source_page,
    edited_by_user: false,
    conflict,
    candidates: ranked.map(stripSource),
  };
}

// Spec, règle de fusion 1 : une valeur saisie par le client n'est jamais écrasée. Les candidats extraits restent
// visibles pour que le client puisse comparer.
export function userField<T>(value: T | null, extracted: Field<T>): Field<T> {
  return {
    value,
    confidence: 1,
    source_doc_id: null,
    source_page: null,
    edited_by_user: true,
    conflict: false,
    candidates: extracted.candidates,
  };
}

import type { DocumentTypeSlug } from "@kyb/shared";

// Seuil sous lequel un champ est signalé « à vérifier » au client (spec).
export const LOW_CONFIDENCE_THRESHOLD = 0.8;

export type FieldOutcome =
  // Valeur attendue trouvée.
  | "correct"
  // Valeur attendue, rien extrait.
  | "missing"
  // Valeur attendue, autre chose extrait.
  | "wrong"
  // Rien attendu, rien extrait.
  | "correct_empty"
  // Rien attendu, quelque chose extrait (faux positif).
  | "false_positive";

export type FieldResult = {
  path: string;
  expected: unknown;
  actual: unknown;
  confidence: number | null;
  outcome: FieldOutcome;
};

type ExtractedFieldShape = { value: unknown; confidence: number; source_page: number | null };

function isExtractedField(node: unknown): node is ExtractedFieldShape {
  return !!node && typeof node === "object" && !Array.isArray(node) && "value" in node && "confidence" in node;
}

function tokenize(path: string): Array<string | number> {
  const tokens: Array<string | number> = [];
  for (const part of path.split(".")) {
    const match = /^([^[\]]+)((?:\[\d+\])*)$/.exec(part);
    if (!match) {
      throw new Error(`Chemin de champ invalide : ${path}`);
    }
    tokens.push(match[1]!);
    for (const index of match[2]!.matchAll(/\[(\d+)\]/g)) {
      tokens.push(Number(index[1]));
    }
  }
  return tokens;
}

// Résout `officers[0].last_name` ou `registered_address.full_address` dans une sortie d'extraction :
// les enveloppes { value, confidence, source_page } sont traversées automatiquement.
// La confiance renvoyée est celle de l'enveloppe la plus proche du champ visé.
export function resolveField(data: unknown, path: string): { value: unknown; confidence: number | null } {
  let current: unknown = data;
  let confidence: number | null = null;

  for (const token of tokenize(path)) {
    if (isExtractedField(current)) {
      confidence = current.confidence;
      current = current.value;
    }
    if (current === null || current === undefined) {
      return { value: null, confidence };
    }
    current = (current as Record<string | number, unknown>)[token];
  }

  if (isExtractedField(current)) {
    return { value: current.value, confidence: current.confidence };
  }
  return { value: current ?? null, confidence };
}

// Comparaison tolérante à la casse et aux espaces, mais pas aux accents ni à l'orthographe :
// « Aicha » pour « Aïcha » est une erreur, « SAHEL  Negoce » pour « SAHEL NEGOCE » n'en est pas une.
export function normalizeForComparison(value: unknown): unknown {
  if (typeof value === "string") {
    return value.normalize("NFC").replace(/\s+/g, " ").trim().toLocaleLowerCase("fr");
  }
  if (Array.isArray(value)) {
    return value.map(normalizeForComparison);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, normalizeForComparison(child)]));
  }
  return value;
}

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || (Array.isArray(value) && value.length === 0);
}

export function scoreField(path: string, expected: unknown, data: unknown): FieldResult {
  const { value: actual, confidence } = resolveField(data, path);

  let outcome: FieldOutcome;
  if (isEmpty(expected)) {
    outcome = isEmpty(actual) ? "correct_empty" : "false_positive";
  } else if (isEmpty(actual)) {
    outcome = "missing";
  } else {
    const same = JSON.stringify(normalizeForComparison(expected)) === JSON.stringify(normalizeForComparison(actual));
    outcome = same ? "correct" : "wrong";
  }

  return { path, expected, actual: actual ?? null, confidence, outcome };
}

export type DocumentResult = {
  dossier: string;
  file: string;
  expected_type: DocumentTypeSlug;
  classified_type: DocumentTypeSlug | null;
  classification_confidence: number | null;
  extraction: "done" | "not_supported" | "failed";
  error_code: string | null;
  fields: FieldResult[];
  cost_usd: number;
  duration_ms: number;
};

export type Metrics = {
  documents: number;
  classification_correct: number;
  // Champs pour lesquels une valeur est attendue (dénominateur du critère « 80 % »).
  expected_values: number;
  correct: number;
  missing: number;
  wrong: number;
  // Champs attendus vides.
  expected_empty: number;
  false_positives: number;
  // Erreurs (wrong, false_positive) avec une confiance ≥ 0,8 : elles ne seraient pas signalées au client.
  confident_errors: number;
  cost_usd: number;
  duration_ms: number;
};

function emptyMetrics(): Metrics {
  return {
    documents: 0,
    classification_correct: 0,
    expected_values: 0,
    correct: 0,
    missing: 0,
    wrong: 0,
    expected_empty: 0,
    false_positives: 0,
    confident_errors: 0,
    cost_usd: 0,
    duration_ms: 0,
  };
}

function add(metrics: Metrics, result: DocumentResult): void {
  metrics.documents++;
  if (result.classified_type === result.expected_type) {
    metrics.classification_correct++;
  }
  metrics.cost_usd += result.cost_usd;
  metrics.duration_ms += result.duration_ms;

  for (const field of result.fields) {
    switch (field.outcome) {
      case "correct":
      case "missing":
      case "wrong":
        metrics.expected_values++;
        metrics[field.outcome]++;
        break;
      case "correct_empty":
        metrics.expected_empty++;
        break;
      case "false_positive":
        metrics.expected_empty++;
        metrics.false_positives++;
        break;
    }
    const isError = field.outcome === "wrong" || field.outcome === "false_positive";
    if (isError && (field.confidence ?? 0) >= LOW_CONFIDENCE_THRESHOLD) {
      metrics.confident_errors++;
    }
  }
}

export function aggregate(results: DocumentResult[]): { byType: Map<DocumentTypeSlug, Metrics>; total: Metrics } {
  const byType = new Map<DocumentTypeSlug, Metrics>();
  const total = emptyMetrics();
  for (const result of results) {
    if (!byType.has(result.expected_type)) {
      byType.set(result.expected_type, emptyMetrics());
    }
    add(byType.get(result.expected_type)!, result);
    add(total, result);
  }
  return { byType, total };
}

export function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

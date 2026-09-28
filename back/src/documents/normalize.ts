import { isIsoDate } from "@kyb/shared";

type Field = { value: unknown; confidence: number; source_page: number | null };

const DATE_KEY = /(^|_)date($|_)/;

function isExtractedField(node: unknown): node is Field {
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    return false;
  }
  const keys = Object.keys(node).sort();
  return keys.length === 3 && keys[0] === "confidence" && keys[1] === "source_page" && keys[2] === "value";
}

function normalizeField(key: string, field: Field, pageCount: number): Field {
  let { value, confidence, source_page } = field;

  if (typeof value === "string") {
    value = value.trim();
    if (value === "") {
      value = null;
    }
  }

  // Une date hors format ISO (ou inexistante) n'est pas « corrigée » : elle est vidée et sera demandée au client.
  if (DATE_KEY.test(key) && typeof value === "string" && !isIsoDate(value)) {
    value = null;
  }

  if (value === null) {
    confidence = 0;
    source_page = null;
  } else if (source_page !== null && source_page > pageCount) {
    source_page = null;
  }

  return { value, confidence, source_page };
}

function walk(node: unknown, key: string, pageCount: number): unknown {
  if (isExtractedField(node)) {
    return normalizeField(key, node, pageCount);
  }
  if (Array.isArray(node)) {
    return node.map((item) => walk(item, key, pageCount));
  }
  if (node && typeof node === "object") {
    return Object.fromEntries(Object.entries(node).map(([childKey, child]) => [childKey, walk(child, childKey, pageCount)]));
  }
  return node;
}

// Normalisation appliquée à la sortie validée du LLM, quel que soit le type de document :
// textes nettoyés, chaînes vides → null, dates non ISO vidées, pages source hors document retirées.
// Les autres règles (forme juridique, pays, téléphone, montants) arrivent avec la fusion.
export function normalizeExtraction<T>(data: T, pageCount: number): T {
  return walk(data, "", pageCount) as T;
}

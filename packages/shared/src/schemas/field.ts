import { z } from "zod";

// Spec, « Fusion des champs entre documents » : chaque champ du dossier garde la valeur retenue et ses candidats.
export const fieldCandidate = <T extends z.ZodType>(valueSchema: T) =>
  z.strictObject({
    value: valueSchema,
    confidence: z.number().min(0).max(1),
    source_doc_id: z.string(),
    source_page: z.number().int().min(1).nullable(),
  });

export const field = <T extends z.ZodType>(valueSchema: T) =>
  z.strictObject({
    value: valueSchema.nullable(),
    confidence: z.number().min(0).max(1),
    // Document d'où vient la valeur retenue ; null si saisie par le client ou valeur par défaut.
    source_doc_id: z.string().nullable(),
    source_page: z.number().int().min(1).nullable(),
    // Valeur saisie ou corrigée par le client : jamais écrasée par une extraction.
    edited_by_user: z.boolean(),
    // Deux documents donnent des valeurs différentes : confiance plafonnée à 0,5, le client tranche.
    conflict: z.boolean(),
    candidates: z.array(fieldCandidate(valueSchema)),
  });

export type FieldCandidate<T> = {
  value: T;
  confidence: number;
  source_doc_id: string;
  source_page: number | null;
};

export type Field<T> = {
  value: T | null;
  confidence: number;
  source_doc_id: string | null;
  source_page: number | null;
  edited_by_user: boolean;
  conflict: boolean;
  candidates: FieldCandidate<T>[];
};

// Seuil sous lequel un champ est signalé « à vérifier » (spec).
export const LOW_CONFIDENCE_THRESHOLD = 0.8;

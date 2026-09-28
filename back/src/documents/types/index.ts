import type { DocumentTypeSlug } from "@kyb/shared";
import type { z } from "zod";
import { idDocumentType } from "./id-document.js";
import { rccmType } from "./rccm.js";
import { statutsType } from "./statuts.js";

// Définition d'un type extractible : schéma de sortie (partagé avec le front) et consignes propres au type.
// `toApplicationPatch` (fusion dans le dossier) arrivera avec la fusion des champs au J3.
export type DocumentTypeDefinition<T extends z.ZodType = z.ZodType> = {
  readonly slug: Exclude<DocumentTypeSlug, "unknown">;
  readonly schema: T;
  readonly prompt: string;
};

// J2 : RCCM, statuts et pièce d'identité. Les autres types arrivent au J4.
const definitions: DocumentTypeDefinition[] = [rccmType, statutsType, idDocumentType];

const registry = new Map<DocumentTypeSlug, DocumentTypeDefinition>(definitions.map((def) => [def.slug, def]));

export function getDocumentTypeDefinition(slug: DocumentTypeSlug): DocumentTypeDefinition | undefined {
  return registry.get(slug);
}

export function extractableTypes(): DocumentTypeSlug[] {
  return [...registry.keys()];
}

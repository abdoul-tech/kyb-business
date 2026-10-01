import { foldText } from "@kyb/shared";

// Spec : UBO = personne détenant 25 % ou plus.
export const UBO_OWNERSHIP_THRESHOLD = 25;

// Titulaire d'une entreprise individuelle, tel qu'écrit sur les RCCM « personne physique ».
export const OWNER_ROLE_PATTERNS = [
  "proprietaire",
  "proprietaire exploitant",
  "exploitant",
  "exploitante",
  "promoteur",
  "promotrice",
  "entrepreneur individuel",
  "entrepreneure individuelle",
  "titulaire",
  "chef d entreprise",
] as const;

// Spec : control person = gérant, PDG, DG, PCA ou équivalent (dont le titulaire d'une entreprise individuelle).
// Comparaison sur le texte sans accents, en mots entiers. « Administrateur » seul (membre du conseil) n'en fait
// pas partie.
export const CONTROL_ROLE_PATTERNS = [
  "gerant",
  "gerante",
  "cogerant",
  "co gerant",
  "cogerante",
  "co gerante",
  "pdg",
  "president directeur general",
  "presidente directrice generale",
  "dg",
  "dga",
  "directeur general",
  "directrice generale",
  "directeur general adjoint",
  "president",
  "presidente",
  "pca",
  "president du conseil",
  "administrateur general",
  "administrateur delegue",
  "managing director",
  "general manager",
  "ceo",
  ...OWNER_ROLE_PATTERNS,
] as const;

function matches(role: string, patterns: readonly string[]): boolean {
  const text = ` ${foldText(role)} `;
  return patterns.some((pattern) => text.includes(` ${pattern} `));
}

export function isControlRole(role: string): boolean {
  return matches(role, CONTROL_ROLE_PATTERNS);
}

export function isOwnerRole(role: string): boolean {
  return matches(role, OWNER_ROLE_PATTERNS);
}

// Entreprise individuelle : forme « Sole Proprietorship » (Annexe A), ou numéro RCCM de personne physique.
// Dans la numérotation OHADA, la lettre A désigne une personne physique et B une personne morale
// (ex. « SN-DKR-2021-A-01234 »).
// Une forme juridique connue l'emporte sur le numéro : une SARL n'est jamais traitée en entreprise individuelle.
export function isSoleProprietorship(entityType: string | null, registrationNumber: string | null): boolean {
  if (entityType !== null) {
    return entityType === "Sole Proprietorship";
  }
  return !!registrationNumber && /(^|[-\s/])A([-\s/]|$)/.test(registrationNumber.toUpperCase());
}

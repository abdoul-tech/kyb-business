import { foldText } from "@kyb/shared";

// Spec : UBO = personne détenant 25 % ou plus.
export const UBO_OWNERSHIP_THRESHOLD = 25;

// Spec : control person = gérant, PDG, DG, PCA ou équivalent. Comparaison sur le texte sans accents,
// en mots entiers. « Administrateur » seul (membre du conseil) n'en fait pas partie.
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
] as const;

export function isControlRole(role: string): boolean {
  const text = ` ${foldText(role)} `;
  return CONTROL_ROLE_PATTERNS.some((pattern) => text.includes(` ${pattern} `));
}

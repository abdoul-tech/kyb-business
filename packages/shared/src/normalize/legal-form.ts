import type { BridgeEntityType } from "../schemas/bridge-values.js";
import { foldText } from "./text.js";

// Annexe A de la spec : forme juridique locale (mention explicite « Forme juridique ») → Business entity type Bridge.
// Les formes les plus spécifiques d'abord (SARL avant SA, SCS avant SNC…). Mots entiers uniquement.
const RULES: Array<{ patterns: string[]; type: BridgeEntityType }> = [
  {
    patterns: ["sarl", "sarlu", "suarl", "societe a responsabilite limitee", "entreprise unipersonnelle a responsabilite limitee"],
    type: "Limited Liability Company (LLC)",
  },
  {
    patterns: ["sas", "sasu", "societe par actions simplifiee", "sa", "societe anonyme"],
    type: "Corporation",
  },
  { patterns: ["scs", "societe en commandite simple"], type: "Limited Partnership (LP)" },
  { patterns: ["snc", "societe en nom collectif"], type: "General Partnership (GP)" },
  { patterns: ["ei", "entreprise individuelle"], type: "Sole Proprietorship" },
  {
    patterns: ["scoop", "scoops", "coop ca", "societe cooperative", "cooperative"],
    type: "Cooperative",
  },
  { patterns: ["fondation"], type: "Foundation" },
  { patterns: ["association"], type: "Nonprofit Organization" },
];

// Renvoie null sans correspondance : le champ reste vide et est demandé au client (spec, « Normalisation »).
export function mapLegalForm(legalFormExplicit: string): BridgeEntityType | null {
  const text = ` ${foldText(legalFormExplicit)} `;
  for (const rule of RULES) {
    if (rule.patterns.some((pattern) => text.includes(` ${pattern} `))) {
      return rule.type;
    }
  }
  return null;
}

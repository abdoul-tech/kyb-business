import type { UboView } from "@kyb/shared";
import { isOwnerRole, isSoleProprietorship } from "../rules/ownership.js";
import type { BusinessFields } from "./merge.js";

export const SOLE_PROPRIETOR_REASON = "Entreprise individuelle : son titulaire détient 100 % de l'entreprise.";

// Titulaire d'une entreprise individuelle : la personne dont le rôle l'indique (« Propriétaire exploitant »…),
// sinon la seule personne connue. Plusieurs candidats possibles : on ne devine pas.
function findOwner(ubos: UboView[]): UboView | null {
  const byRole = ubos.filter((ubo) => ubo.role.candidates.some((candidate) => isOwnerRole(candidate.value)));
  if (byRole.length === 1) {
    return byRole[0]!;
  }
  return byRole.length === 0 && ubos.length === 1 ? ubos[0]! : null;
}

// Aucun document n'écrit que le titulaire d'une entreprise individuelle détient 100 % : on le déduit, sans
// écraser une part lue dans un document. Appliqué avant les saisies du client, qui restent prioritaires.
export function applySoleProprietorship(business: BusinessFields, ubos: UboView[]): UboView[] {
  if (!isSoleProprietorship(business.entity_type.value, business.registration_number.value)) {
    return ubos;
  }
  const owner = findOwner(ubos);
  if (!owner) {
    return ubos;
  }
  return ubos.map((ubo) => {
    if (ubo.id !== owner.id) {
      return ubo;
    }
    const ownership =
      ubo.ownership_pct.value === null
        ? {
            ...ubo.ownership_pct,
            value: 100,
            confidence: business.entity_type.value === "Sole Proprietorship" ? business.entity_type.confidence : 0.9,
            source_doc_id: business.registration_number.source_doc_id ?? business.entity_type.source_doc_id,
            source_page: null,
            derived_reason: SOLE_PROPRIETOR_REASON,
          }
        : ubo.ownership_pct;
    return { ...ubo, ownership_pct: ownership, is_ubo: (ownership.value ?? 0) >= 25, is_control_person: true };
  });
}

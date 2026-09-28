import { RccmSchema } from "@kyb/shared";
import type { DocumentTypeDefinition } from "./index.js";

export const rccmType: DocumentTypeDefinition<typeof RccmSchema> = {
  slug: "rccm",
  schema: RccmSchema,
  prompt: `Document : extrait du Registre du Commerce et du Crédit Mobilier (RCCM) ou registre local équivalent.

- legal_name : dénomination sociale exacte, telle qu'écrite (avec le sigle éventuel s'il fait partie du nom).
- legal_form_explicit : UNIQUEMENT le texte de la mention explicite « Forme juridique » (ou « Forme sociale »).
  Ne le déduis JAMAIS d'un sigle accolé au nom (« SAIDOU AUTO SARL » ne suffit pas) : sans mention explicite, null.
- legal_form_other : précision sur la forme juridique si la mention en contient une (ex. « unipersonnelle »), sinon null.
- trade_name : nom commercial / enseigne s'il est distinct de la dénomination, sinon null. acronym : sigle déclaré.
- rccm_number : numéro d'immatriculation RCCM exact (ex. « SN-DKR-2019-B-12345 »).
- registration_date : date d'immatriculation. activity_start_date : date de début d'activité si indiquée.
- country : pays d'immatriculation. registered_address.full_address : adresse du siège telle qu'écrite ;
  raw_components : les éléments étiquetés (quartier, rue, BP, ville…) si le document les sépare, sinon null.
- object : objet social tel qu'écrit. activity : activité principale. secondary_activities : activités secondaires.
- capital_amount / capital_currency : capital social. capital_cash_amount / capital_in_kind_amount : apports en
  numéraire et en nature si le document les distingue.
- officers : dirigeants mentionnés (gérant, PDG, DG, PCA, administrateurs…), avec leur rôle tel qu'écrit.`,
};

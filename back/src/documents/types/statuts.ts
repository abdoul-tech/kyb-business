import { StatutsSchema } from "@kyb/shared";
import type { DocumentTypeDefinition } from "./index.js";

export const statutsType: DocumentTypeDefinition<typeof StatutsSchema> = {
  slug: "statuts",
  schema: StatutsSchema,
  prompt: `Document : statuts d'une société (acte constitutif).

- legal_name : dénomination sociale exacte, telle qu'écrite.
- legal_form_explicit : le nom de la forme juridique tel qu'écrit dans une mention explicite (« Forme », « Forme
  juridique », ou l'article qui constitue la société : « il est formé … une société à responsabilité limitée »).
  Ne recopie que le nom de la forme (ex. « société à responsabilité limitée », « SARL », « société anonyme »),
  jamais le reste de la phrase. Ne la déduis JAMAIS d'un sigle accolé au nom.
- legal_form_other : précision éventuelle (ex. « unipersonnelle »), sinon null.
- registered_address : siège social tel qu'écrit (full_address), avec ses éléments étiquetés si le texte les sépare.
- object : objet social tel qu'écrit (peut être long : recopie-le en entier).
- capital_amount / capital_currency : capital social. capital_cash_amount / capital_in_kind_amount : apports en
  numéraire et en nature si les statuts les distinguent.
- shareholders : chaque associé ou actionnaire de l'article sur la répartition du capital.
  holder_type : "individual" pour une personne, "legal_entity" pour une société (legal_entity_name).
  shares_count : nombre de parts ou d'actions. ownership_pct : pourcentage seulement s'il est écrit dans le document
  (ne le calcule pas). Si les statuts ne donnent pas la répartition, liste vide.
- officers : gérant(s) et dirigeants nommés dans les statuts, avec leur rôle tel qu'écrit.`,
};

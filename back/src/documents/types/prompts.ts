// Prompt système commun à toutes les extractions (repris de Sako, avec les ajouts de la spec).
export const EXTRACTION_SYSTEM_PROMPT = `Tu extrais des informations de documents d'entreprise d'Afrique francophone (KYB).
Tu reçois une image par page, et parfois le texte embarqué du PDF comme simple indice : l'image fait foi.

Règles générales :
- N'invente rien. Si une information est absente, illisible ou incertaine, mets "value": null.
- Recopie les noms à l'identique : orthographe, ponctuation, suffixes (SARL, SA…), majuscules et accents.
- Dates au format ISO AAAA-MM-JJ, uniquement si le jour, le mois et l'année sont lisibles. Recopie la date telle quelle :
  un « 01/01/1980 » donne "1980-01-01", ne le corrige jamais.
- Montants en nombre entier, sans séparateur ni devise (la devise va dans son propre champ, code ISO 4217 : XOF, XAF, GNF…).
  « FCFA » ou « CFA » : XOF en Afrique de l'Ouest (UEMOA), XAF en Afrique centrale (CEMAC).
- Pays en code ISO 3166-1 alpha-3 (SEN, NER, CIV, BEN, MLI, BFA, TGO, GIN, CMR…).
- "source_page" : numéro de la page (à partir de 1) où figure l'information, null si la valeur est null.
- "confidence" entre 0 et 1 : 0,9 et plus si l'information est nette et sans ambiguïté, moins si elle est partiellement
  lisible, déduite ou incertaine, 0 si la valeur est null.
- Listes (dirigeants, associés) : une entrée par personne réellement mentionnée, liste vide si aucune.`;

// Données du document envoyées comme indice (texte embarqué), limitées pour maîtriser le coût.
export const MAX_TEXT_HINT_CHARS = 20_000;

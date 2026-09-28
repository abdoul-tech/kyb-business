import { IdDocumentSchema } from "@kyb/shared";
import type { DocumentTypeDefinition } from "./index.js";

export const idDocumentType: DocumentTypeDefinition<typeof IdDocumentSchema> = {
  slug: "id_document",
  schema: IdDocumentSchema,
  prompt: `Document : pièce d'identité (passeport, carte nationale d'identité, CIP, NPI).
Lis la zone visuelle ; la bande MRZ (lignes « P<… » ou « I<… ») sert à confirmer les valeurs, pas à les remplacer.

- last_name : nom de famille. first_name : premier prénom. middle_names : autres prénoms, séparés par un espace.
  Recopie-les tels qu'écrits dans la zone visuelle (accents compris).
- date_of_birth : date de naissance. Un « 01/01 » est fréquent sur ces documents : recopie-le sans le corriger.
- nationality : nationalité telle qu'écrite (ex. « Sénégalaise », « NIGERIENNE »).
- address : adresse si elle figure sur le document (souvent au verso d'une CNI), sinon null.
- expiry_date : date d'expiration. document_number : numéro du document. issuing_authority : autorité de délivrance.
- document_type : "Passeport", "CNI", "CIP" ou "NPI-fID" selon le titre du document.
- npi : numéro personnel d'identification s'il est présent, sinon null.`,
};

import { createHash } from "node:crypto";
import type { DocumentTypeSlug } from "@kyb/shared";
import { makePdf } from "./pdf.js";

// Documents de test ENTIÈREMENT FICTIFS (entreprises, personnes, numéros inventés), en attendant de vrais
// documents anonymisés. Générés à l'identique à chaque appel : leur hash sert de clé de replay.
export type Sample = {
  name: string;
  expectedType: DocumentTypeSlug;
  pdf: Buffer;
  pageCount: number;
  sha256: string;
};

function sample(name: string, expectedType: DocumentTypeSlug, pages: string[]): Sample {
  const pdf = makePdf(pages.length, { text: (i) => pages[i]! });
  return { name, expectedType, pdf, pageCount: pages.length, sha256: createHash("sha256").update(pdf).digest("hex") };
}

// Cas SAIDOU AUTO : « SARL » accolé au nom, mais aucune mention « Forme juridique ».
export const rccmSample = sample("rccm-barry-auto", "rccm", [
  [
    "REPUBLIQUE DU NIGER",
    "Fraternité - Travail - Progrès",
    "",
    "TRIBUNAL DE COMMERCE DE NIAMEY",
    "REGISTRE DU COMMERCE ET DU CREDIT MOBILIER",
    "",
    "EXTRAIT DU REGISTRE DU COMMERCE ET DU CREDIT MOBILIER",
    "",
    "Numéro RCCM : NE-NIM-01-2019-B12-00987",
    "Date d'immatriculation : 14/03/2019",
    "",
    "Dénomination sociale : BARRY AUTO SARL",
    "Nom commercial : BARRY AUTO",
    "Adresse du siège : Quartier Plateau, Rue PL-34, BP 1234, Niamey",
    "Activité principale : Commerce de véhicules automobiles et de pièces détachées",
    "Capital social : 1 000 000 FCFA",
    "",
    "DIRIGEANTS",
    "Nom : BARRY    Prénoms : Ibrahim Moussa",
    "Fonction : Gérant",
    "Nationalité : Nigérienne",
    "Date de naissance : 01/01/1980    Lieu de naissance : Zinder",
    "",
    "Fait à Niamey, le 20/03/2019",
    "Le Greffier en chef",
  ].join("\n"),
]);

export const statutsSample = sample("statuts-sahel-negoce", "statuts", [
  [
    "SAHEL NEGOCE",
    "Société à Responsabilité Limitée au capital de 2 000 000 F CFA",
    "Siège social : Lot 45, Zone industrielle, Ouagadougou, Burkina Faso",
    "",
    "STATUTS",
    "",
    "Les soussignés :",
    "- Monsieur OUEDRAOGO Paul Wendkouni, né le 12/05/1975 à Koudougou, de nationalité burkinabè",
    "- Madame SAWADOGO Aïcha, née le 03/11/1982 à Ouagadougou, de nationalité burkinabè",
    "",
    "ARTICLE 1 - FORME",
    "Il est formé entre les propriétaires des parts ci-après créées une société à responsabilité limitée",
    "régie par l'Acte uniforme OHADA relatif au droit des sociétés commerciales.",
    "",
    "ARTICLE 2 - OBJET",
    "La société a pour objet, au Burkina Faso et à l'étranger : l'import, l'export et la distribution",
    "de produits alimentaires, ainsi que toutes opérations commerciales s'y rattachant.",
    "",
    "ARTICLE 3 - DENOMINATION",
    "La société a pour dénomination : SAHEL NEGOCE.",
    "",
    "ARTICLE 4 - SIEGE SOCIAL",
    "Le siège social est fixé à Ouagadougou, Lot 45, Zone industrielle.",
  ].join("\n"),
  [
    "ARTICLE 7 - CAPITAL SOCIAL",
    "Le capital social est fixé à la somme de deux millions (2 000 000) de francs CFA, entièrement libéré",
    "en numéraire. Il est divisé en deux cents (200) parts sociales de dix mille (10 000) francs CFA chacune,",
    "réparties comme suit :",
    "- Monsieur OUEDRAOGO Paul Wendkouni : cent vingt (120) parts, soit 60 %",
    "- Madame SAWADOGO Aïcha : quatre-vingts (80) parts, soit 40 %",
    "Total : deux cents (200) parts",
    "",
    "ARTICLE 15 - GERANCE",
    "Est nommé gérant pour une durée indéterminée : Monsieur OUEDRAOGO Paul Wendkouni.",
    "",
    "Fait à Ouagadougou, le 10 janvier 2021",
    "Signatures des associés",
  ].join("\n"),
]);

export const passportSample = sample("passeport-specimen", "id_document", [
  [
    "REPUBLIQUE DU SENEGAL",
    "PASSEPORT / PASSPORT",
    "",
    "Type / Type : P      Code du pays / Country code : SEN",
    "Passeport N° / Passport No : A00000000",
    "",
    "Nom / Surname : SPECIMEN",
    "Prénoms / Given names : FATOU AMINATA",
    "Nationalité / Nationality : SENEGALAISE",
    "Date de naissance / Date of birth : 01 JAN 1990",
    "Lieu de naissance / Place of birth : THIES",
    "Sexe / Sex : F",
    "Date de délivrance / Date of issue : 15 FEV 2022",
    "Date d'expiration / Date of expiry : 14 FEV 2032",
    "Autorité / Authority : DGPAF DAKAR",
    "",
    "P<SENSPECIMEN<<FATOU<AMINATA<<<<<<<<<<<<<<<<",
    "A000000000SEN9001019F3202148<<<<<<<<<<<<<<04",
  ].join("\n"),
]);

export const samples = [rccmSample, statutsSample, passportSample];

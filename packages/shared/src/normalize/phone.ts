import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

// Pays d'Afrique francophone (et quelques pays fréquents) : ISO alpha-3 → alpha-2 pour libphonenumber.
const ALPHA3_TO_ALPHA2: Record<string, CountryCode> = {
  SEN: "SN",
  NER: "NE",
  CIV: "CI",
  BEN: "BJ",
  MLI: "ML",
  BFA: "BF",
  TGO: "TG",
  GIN: "GN",
  GNB: "GW",
  CMR: "CM",
  GAB: "GA",
  COG: "CG",
  COD: "CD",
  TCD: "TD",
  CAF: "CF",
  GNQ: "GQ",
  MRT: "MR",
  MDG: "MG",
  COM: "KM",
  DJI: "DJ",
  BDI: "BI",
  RWA: "RW",
  MAR: "MA",
  TUN: "TN",
  DZA: "DZ",
  FRA: "FR",
  BEL: "BE",
  NGA: "NG",
  GHA: "GH",
};

// Spec : téléphone en E.164, pays de l'entreprise par défaut. null si le numéro n'est pas valide.
export function normalizePhone(value: string, countryAlpha3: string | null): string | null {
  const defaultCountry = countryAlpha3 ? ALPHA3_TO_ALPHA2[countryAlpha3] : undefined;
  const parsed = parsePhoneNumberFromString(value, defaultCountry);
  return parsed?.isValid() ? parsed.number : null;
}

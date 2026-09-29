import { describe, expect, it } from "vitest";
import { ApplicationPatchSchema, jaroWinkler, mapLegalForm, normalizeName, normalizePhone } from "../src/index.js";

describe("mapLegalForm (Annexe A)", () => {
  it.each([
    ["SARL", "Limited Liability Company (LLC)"],
    ["Société à Responsabilité Limitée", "Limited Liability Company (LLC)"],
    ["société à responsabilité limitée unipersonnelle", "Limited Liability Company (LLC)"],
    ["SARLU", "Limited Liability Company (LLC)"],
    ["SA", "Corporation"],
    ["Société Anonyme avec Conseil d'Administration", "Corporation"],
    ["SAS", "Corporation"],
    ["Société par actions simplifiée", "Corporation"],
    ["Entreprise Individuelle", "Sole Proprietorship"],
    ["SNC", "General Partnership (GP)"],
    ["Société en commandite simple", "Limited Partnership (LP)"],
    ["Association", "Nonprofit Organization"],
    ["Fondation", "Foundation"],
    ["Société coopérative simplifiée (SCOOPS)", "Cooperative"],
  ])("%s → %s", (input, expected) => {
    expect(mapLegalForm(input)).toBe(expected);
  });

  it("renvoie null sans correspondance (champ demandé au client)", () => {
    expect(mapLegalForm("GIE")).toBeNull();
    expect(mapLegalForm("Groupement d'intérêt économique")).toBeNull();
    expect(mapLegalForm("")).toBeNull();
  });

  it("ne confond pas un mot contenant « sa » avec une SA", () => {
    expect(mapLegalForm("Sahel")).toBeNull();
  });
});

describe("normalizeName / jaroWinkler", () => {
  it("ignore accents, casse et ordre des mots", () => {
    expect(normalizeName("OUÉDRAOGO Paul")).toBe(normalizeName("paul Ouedraogo"));
  });

  it("donne 1 pour des noms identiques et un score élevé pour une faute de frappe", () => {
    expect(jaroWinkler("ABC", "ABC")).toBe(1);
    expect(jaroWinkler(normalizeName("Ibrahim BARRY"), normalizeName("Ibrahim BARY"))).toBeGreaterThan(0.92);
    expect(jaroWinkler(normalizeName("Awa DIOP"), normalizeName("Moussa KANE"))).toBeLessThan(0.7);
    expect(jaroWinkler("", "ABC")).toBe(0);
  });
});

describe("normalizePhone", () => {
  it("met en E.164, avec le pays de l'entreprise par défaut", () => {
    expect(normalizePhone("+227 90 00 00 00", null)).toBe("+22790000000");
    expect(normalizePhone("77 123 45 67", "SEN")).toBe("+221771234567");
  });

  it("renvoie null pour un numéro invalide ou sans pays déductible", () => {
    expect(normalizePhone("123", "SEN")).toBeNull();
    expect(normalizePhone("77 123 45 67", null)).toBeNull();
  });
});

describe("ApplicationPatchSchema", () => {
  it("accepte des valeurs brutes valides et null pour vider un champ", () => {
    const parsed = ApplicationPatchSchema.parse({
      business: {
        email: "contact@example.com",
        website: null,
        no_website_explanation: "Nos clients nous trouvent via WhatsApp.",
        source_of_funds: "Sales of Goods and Services",
        annual_revenue: "$100,000 – $999,999 USD",
        monthly_volume_usd: 25000,
        dao: false,
      },
    });
    expect(parsed.business?.website).toBeNull();
  });

  it("refuse un champ inconnu, un email invalide, une valeur hors liste Bridge ou une date non ISO", () => {
    for (const business of [
      { inconnu: "x" },
      { email: "pas-un-email" },
      { source_of_funds: "Revenus" },
      { incorporation_date: "14/03/2019" },
      { website: "ftp://site" },
      { share_capital: { amount: 1000, currency: "FCFA" } },
    ]) {
      expect(ApplicationPatchSchema.safeParse({ business }).success).toBe(false);
    }
  });
});

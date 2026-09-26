import { describe, expect, it } from "vitest";
import { LicenseSchema, LogisticsDocumentSchema } from "../src/index.js";

const extracted = (value: unknown) => ({
  value,
  confidence: 0.95,
  source_page: 1,
});

const address = extracted({ full_address: "Cotonou, Bénin", raw_components: null });

const validLicense = {
  document_type: extracted("importer_card"),
  issuing_authority: extracted("Ministère du Commerce"),
  license_type: extracted("Carte d'importateur"),
  license_number: extracted("CI-2026-00123"),
  holder_name: extracted("Entreprise Exemple SARL"),
  authorized_activity: extracted("Importation de matériel agricole"),
  issue_date: extracted("2026-01-15"),
  expiry_date: extracted("2026-12-31"),
  validity_period: extracted(null),
};

const validLogisticsDocument = {
  document_type: extracted("bill_of_lading"),
  document_number: extracted("BL-2026-0045"),
  document_date: extracted("2026-06-10"),
  parties: [
    {
      name: extracted("Entreprise Exemple SARL"),
      role: extracted("importer"),
      address,
    },
    {
      name: extracted("Transport Exemple SA"),
      role: extracted("carrier"),
      address: extracted(null),
    },
  ],
  addresses: [
    { purpose: extracted("origin"), address: extracted(null) },
    { purpose: extracted("destination"), address },
  ],
  dates: [
    { event: extracted("departure"), date: extracted("2026-06-01") },
    { event: extracted("arrival"), date: extracted("2026-06-10") },
  ],
  goods: [
    {
      description: extracted("Matériel agricole"),
      quantity: extracted(12),
      unit: extracted("pallets"),
    },
  ],
};

describe("LicenseSchema", () => {
  it("accepts authority, type, number, holder, activity, and validity", () => {
    expect(LicenseSchema.safeParse(validLicense).success).toBe(true);
  });

  it("allows expiry to be checked by business rules, not Zod", () => {
    const input = { ...validLicense, expiry_date: extracted("2020-12-31") };

    expect(LicenseSchema.safeParse(input).success).toBe(true);
  });

  it("rejects unsupported document types", () => {
    const input = { ...validLicense, document_type: extracted("rccm") };

    expect(LicenseSchema.safeParse(input).success).toBe(false);
  });
});

describe("LogisticsDocumentSchema", () => {
  it("accepts parties, addresses, dates, and goods", () => {
    expect(LogisticsDocumentSchema.safeParse(validLogisticsDocument).success)
      .toBe(true);
  });

  it("accepts a warehouse lease without transport or goods details", () => {
    const input = {
      document_type: extracted("warehouse_lease"),
      document_number: extracted(null),
      document_date: extracted("2018-01-01"),
      parties: [],
      addresses: [{ purpose: extracted("warehouse"), address }],
      dates: [{ event: extracted("lease_start"), date: extracted("2018-01-01") }],
      goods: [],
    };

    expect(LogisticsDocumentSchema.safeParse(input).success).toBe(true);
  });

  it("rejects undeclared fields", () => {
    expect(
      LogisticsDocumentSchema.safeParse({
        ...validLogisticsDocument,
        undeclared: extracted("value"),
      }).success,
    ).toBe(false);
  });
});
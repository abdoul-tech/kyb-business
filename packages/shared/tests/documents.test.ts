import { describe, expect, it } from "vitest";
import {
  GoodStandingSchema,
  IdDocumentSchema,
  OwnershipDocumentSchema,
  ProofOfAddressSchema,
  RccmSchema,
  RccmModificatifSchema,
  StatutsSchema,
  TaxCertificateSchema,
} from "../src/index.js";

const extracted = (value: unknown, confidence = 0.95) => ({
  value,
  confidence,
  source_page: 1,
});

const validRccm = {
  legal_name: extracted("Entreprise Exemple SARL"),
  trade_name: extracted(null),
  acronym: extracted(null),
  legal_form_explicit: extracted("SARL"),
  legal_form_other: extracted(null),
  object: extracted("Commerce de pièces détachées"),
  activity_start_date: extracted(null),
  rccm_number: extracted("SN-DKR-2024-B-12345"),
  registration_date: extracted("2024-04-15"),
  country: extracted("SEN"),
  registered_address: extracted({
    full_address: "Dakar, Sénégal",
    raw_components: [{ label: "municipality", value: "Dakar" }],
  }),
  activity: extracted("Commerce de pièces détachées"),
  secondary_activities: extracted(null),
  capital_amount: extracted(1000000),
  capital_currency: extracted("XOF"),
  capital_cash_amount: extracted(null),
  capital_in_kind_amount: extracted(null),
  officers: [
    {
      first_name: extracted("Awa"),
      last_name: extracted("Diop"),
      role: extracted("Gérante"),
      nationality: extracted(null),
      address: extracted(null),
      date_of_birth: extracted(null),
      place_of_birth: extracted(null),
    },
  ],
};

const validIdDocument = {
  first_name: extracted("Awa"),
  last_name: extracted("Diop"),
  middle_names: extracted(null),
  date_of_birth: extracted("1990-01-01"),
  nationality: extracted("Sénégalaise"),
  address: extracted(null),
  expiry_date: extracted("2030-12-31"),
  document_type: extracted("Passeport"),
  document_number: extracted("A1234567"),
  issuing_authority: extracted(null),
  npi: extracted(null),
};

const validStatuts = {
  legal_name: extracted("Entreprise Exemple SARL"),
  legal_form_explicit: extracted("SARL"),
  legal_form_other: extracted(null),
  registered_address: extracted({
    full_address: "Dakar, Sénégal",
    raw_components: null,
  }),
  object: extracted("Commerce de pièces détachées"),
  capital_amount: extracted(1000000),
  capital_currency: extracted("XOF"),
  capital_cash_amount: extracted(800000),
  capital_in_kind_amount: extracted(200000),
  shareholders: [
    {
      holder_type: extracted("individual"),
      first_name: extracted("Awa"),
      last_name: extracted("Diop"),
      legal_entity_name: extracted(null),
      shares_count: extracted(80),
      ownership_pct: extracted(80),
    },
  ],
  officers: [
    {
      first_name: extracted("Awa"),
      last_name: extracted("Diop"),
      role: extracted("Gérante"),
      nationality: extracted(null),
      address: extracted(null),
      date_of_birth: extracted(null),
      place_of_birth: extracted(null),
    },
  ],
};

const validOwnershipDocument = {
  shareholders: [
    {
      holder_type: extracted("individual"),
      first_name: extracted("Awa"),
      last_name: extracted("Diop"),
      legal_entity_name: extracted(null),
      shares_count: extracted(80),
      ownership_pct: extracted(80),
    },
    {
      holder_type: extracted("legal_entity"),
      first_name: extracted(null),
      last_name: extracted(null),
      legal_entity_name: extracted("Holding Exemple SA"),
      shares_count: extracted(20),
      ownership_pct: extracted(20),
    },
  ],
};

const validRccmModificatif = {
  rccm_number: extracted("SN-DKR-2024-B-12345"),
  modification_type: extracted("activities"),
  modification_type_other: extracted(null),
  registered_address_change: {
    old_value: extracted(null),
    old_effective_date: extracted(null),
    new_value: extracted(null),
    new_effective_date: extracted(null),
  },
  legal_form_change: {
    old_value: extracted(null),
    old_effective_date: extracted(null),
    new_value: extracted(null),
    new_effective_date: extracted(null),
  },
  capital_change: {
    old_value: extracted(null),
    old_effective_date: extracted(null),
    new_value: extracted(null),
    new_effective_date: extracted(null),
  },
  activities_added: [extracted("Commerce de matériel agricole")],
  activities_removed: [],
  denomination_change: {
    old_value: extracted(null),
    new_value: extracted(null),
  },
  directors_changes: [],
  modification_date: extracted("2025-06-20"),
  supporting_evidence_reference: extracted("PV d'assemblée générale du 20/06/2025"),
};

const validTaxCertificate = {
  tax_id: extracted("001234567890"),
  legal_name: extracted("Entreprise Exemple SARL"),
  registered_address: extracted({
    full_address: "Dakar, Sénégal",
    raw_components: null,
  }),
};

const validGoodStanding = {
  document: {
    type: extracted("tax_clearance"),
    certificate_number: extracted("QF-2026-000123"),
    issue_date: extracted("2026-09-20"),
    validity_period: extracted("2026"),
  },
  taxpayer: {
    tax_id: extracted("3200000000000"),
    legal_name: extracted("Entreprise Exemple SARL"),
    taxpayer_type: extracted("legal_entity"),
  },
  fiscal_status: {
    status: extracted("compliant"),
    covered_period: extracted("2026"),
  },
  authority: {
    issuing_authority: extracted("DGI"),
    signatory: extracted("Nom du signataire"),
    signature_present: extracted(true),
  },
};

const validProofOfAddress = {
  document_type: extracted("utility_bill"),
  name_on_document: extracted("Entreprise Exemple SARL"),
  address: extracted({
    full_address: "Dakar, Sénégal",
    raw_components: null,
  }),
  document_date: extracted("2026-07-01"),
};

describe("RccmSchema", () => {
  it("accepts a complete extraction with absent optional values set to null", () => {
    expect(RccmSchema.safeParse(validRccm).success).toBe(true);
  });

  it("accepts low confidence for downstream review", () => {
    const input = {
      ...validRccm,
      legal_name: extracted("Entreprise Exemple SARL", 0.79),
    };

    expect(RccmSchema.safeParse(input).success).toBe(true);
  });

  it("rejects confidence outside the 0 to 1 range", () => {
    const input = {
      ...validRccm,
      legal_name: extracted("Entreprise Exemple SARL", 1.01),
    };

    expect(RccmSchema.safeParse(input).success).toBe(false);
  });

  it("rejects fields not declared by the schema", () => {
    expect(RccmSchema.safeParse({ ...validRccm, undeclared: "value" }).success)
      .toBe(false);
  });
});

describe("IdDocumentSchema", () => {
  it("accepts a supported identity document type", () => {
    expect(IdDocumentSchema.safeParse(validIdDocument).success).toBe(true);
  });

  it("rejects an unsupported identity document type", () => {
    const input = {
      ...validIdDocument,
      document_type: extracted("Carte professionnelle"),
    };

    expect(IdDocumentSchema.safeParse(input).success).toBe(false);
  });
});

describe("StatutsSchema", () => {
  it("accepts company details, shareholders, and officers", () => {
    expect(StatutsSchema.safeParse(validStatuts).success).toBe(true);
  });

  it("accepts statutes without a stated ownership breakdown", () => {
    expect(
      StatutsSchema.safeParse({ ...validStatuts, shareholders: [] }).success,
    ).toBe(true);
  });

  it("rejects ownership percentages outside the 0 to 100 range", () => {
    const input = {
      ...validStatuts,
      shareholders: [
        {
          ...validStatuts.shareholders[0],
          ownership_pct: extracted(100.1),
        },
      ],
    };

    expect(StatutsSchema.safeParse(input).success).toBe(false);
  });
});

describe("OwnershipDocumentSchema", () => {
  it("accepts individual and legal-entity shareholders", () => {
    expect(OwnershipDocumentSchema.safeParse(validOwnershipDocument).success)
      .toBe(true);
  });

  it("accepts an empty extraction for business-rule handling", () => {
    expect(OwnershipDocumentSchema.safeParse({ shareholders: [] }).success)
      .toBe(true);
  });

  it("rejects ownership percentages outside the 0 to 100 range", () => {
    const input = {
      shareholders: [
        {
          ...validOwnershipDocument.shareholders[0],
          ownership_pct: extracted(100.1),
        },
      ],
    };

    expect(OwnershipDocumentSchema.safeParse(input).success).toBe(false);
  });
});

describe("RccmModificatifSchema", () => {
  it("accepts an M2 extraction with before/after groups", () => {
    expect(RccmModificatifSchema.safeParse(validRccmModificatif).success)
      .toBe(true);
  });

  it("accepts director changes with before and after values", () => {
    const input = {
      ...validRccmModificatif,
      directors_changes: [
        {
          change_type: extracted("added"),
          old_value: null,
          new_value: {
            first_name: extracted("Awa"),
            last_name: extracted("Diop"),
            role: extracted("Gérante"),
            nationality: extracted("Sénégalaise"),
            address: extracted("Dakar, Sénégal"),
            date_of_birth: extracted("1990-01-01"),
            place_of_birth: extracted("Dakar"),
          },
          effective_date: extracted("2025-06-20"),
        },
      ],
    };

    expect(RccmModificatifSchema.safeParse(input).success).toBe(true);
  });

  it("accepts absent values as null in each change group", () => {
    const input = {
      ...validRccmModificatif,
      modification_type: extracted(null),
      modification_date: extracted(null),
      activities_added: [],
      activities_removed: [],
    };

    expect(RccmModificatifSchema.safeParse(input).success).toBe(true);
  });

  it("rejects undeclared fields", () => {
    expect(
      RccmModificatifSchema.safeParse({
        ...validRccmModificatif,
        unknown_field: extracted("123"),
      }).success,
    ).toBe(false);
  });
});

describe("TaxCertificateSchema", () => {
  it("accepts the tax identifier, legal name, and registered address", () => {
    expect(TaxCertificateSchema.safeParse(validTaxCertificate).success)
      .toBe(true);
  });

  it("accepts absent values as null", () => {
    const input = {
      tax_id: extracted(null),
      legal_name: extracted(null),
      registered_address: extracted(null),
    };

    expect(TaxCertificateSchema.safeParse(input).success).toBe(true);
  });

  it("rejects undeclared fields", () => {
    expect(
      TaxCertificateSchema.safeParse({
        ...validTaxCertificate,
        undeclared: extracted("value"),
      }).success,
    ).toBe(false);
  });
});

describe("GoodStandingSchema", () => {
  it("accepts an explicitly compliant tax clearance", () => {
    expect(GoodStandingSchema.safeParse(validGoodStanding).success).toBe(true);
  });

  it("does not require or infer compliance from the document type", () => {
    const input = {
      ...validGoodStanding,
      fiscal_status: {
        status: extracted(null),
        covered_period: extracted(null),
      },
    };
    const result = GoodStandingSchema.safeParse(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fiscal_status.status.value).toBeNull();
    }
  });

  it("accepts a non-bankruptcy document without tax-specific data", () => {
    const input = {
      ...validGoodStanding,
      document: { ...validGoodStanding.document, type: extracted("non_bankruptcy") },
      taxpayer: {
        tax_id: extracted(null),
        legal_name: extracted("Entreprise Exemple SARL"),
        taxpayer_type: extracted("legal_entity"),
      },
      fiscal_status: {
        status: extracted(null),
        covered_period: extracted(null),
      },
    };

    expect(GoodStandingSchema.safeParse(input).success).toBe(true);
  });

  it("rejects an unsupported document subtype", () => {
    const input = {
      ...validGoodStanding,
      document: { ...validGoodStanding.document, type: extracted("tax_residency") },
    };

    expect(GoodStandingSchema.safeParse(input).success).toBe(false);
  });
});

describe("ProofOfAddressSchema", () => {
  it("accepts a utility bill with holder, address, and document date", () => {
    expect(ProofOfAddressSchema.safeParse(validProofOfAddress).success)
      .toBe(true);
  });

  it("accepts an older commercial lease for downstream rule evaluation", () => {
    const input = {
      ...validProofOfAddress,
      document_type: extracted("commercial_lease"),
      document_date: extracted("2019-01-01"),
    };

    expect(ProofOfAddressSchema.safeParse(input).success).toBe(true);
  });

  it("accepts missing extracted values as null", () => {
    const input = {
      document_type: extracted(null),
      name_on_document: extracted(null),
      address: extracted(null),
      document_date: extracted(null),
    };

    expect(ProofOfAddressSchema.safeParse(input).success).toBe(true);
  });

  it("rejects unsupported document types", () => {
    const input = {
      ...validProofOfAddress,
      document_type: extracted("passport"),
    };

    expect(ProofOfAddressSchema.safeParse(input).success).toBe(false);
  });
});

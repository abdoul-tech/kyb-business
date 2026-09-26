import { z } from "zod";
import { describe, expect, it } from "vitest";
import { BusinessActivitySchema } from "../src/index.js";

const extracted = (value: unknown) => ({
  value,
  confidence: 0.95,
  source_page: 1,
});

const party = {
  name: extracted("Entreprise Exemple SARL"),
  legal_form: extracted("SARL"),
  tax_id: extracted("001234567890"),
  rccm_number: extracted("RB/COT/24 B 12345"),
  address: extracted({ full_address: "Cotonou", raw_components: null }),
};

const validInvoiceActivity = {
  activity: {
    category: extracted("IT services"),
    description: extracted("Développement d'une application web"),
    role: extracted("service_provider"),
    role_other: extracted(null),
  },
  evidence: {
    type: "invoice",
    invoice: {
      document: {
        number: extracted("FV-2026-00125"),
        date: extracted("2026-09-15"),
        type: extracted("sale"),
        currency: extracted("XOF"),
      },
      issuer: party,
      customer: {
        ...party,
        name: extracted("XYZ BENIN SA"),
        legal_form: extracted("SA"),
      },
      items: [
        {
          description: extracted("Développement application web"),
          quantity: extracted(1),
          unit_price: extracted(2500000),
          total_price: extracted(2500000),
          unit: extracted("service"),
        },
      ],
      amounts: {
        subtotal: extracted(2500000),
        vat_rate: extracted(18),
        vat_amount: extracted(450000),
        other_taxes: [],
        total: extracted(2950000),
      },
      fiscal: {
        mecef_number: extracted("NIM-123456"),
        electronic_signature: extracted("signature électronique"),
        electronic_code: extracted("ABC123"),
      },
    },
  },
};

const validContractActivity = {
  activity: {
    category: extracted("IT services"),
    description: extracted("Développement et maintenance d'une plateforme web"),
    role: extracted("service_provider"),
    role_other: extracted(null),
  },
  evidence: {
    type: "contract",
    contract: {
      document: {
        number: extracted("CTR-2026-045"),
        contract_type: extracted("service"),
        signature_date: extracted("2026-05-20"),
        effective_date: extracted("2026-06-01"),
      },
      parties: [
        { ...party, role: extracted("service_provider"), role_other: extracted(null) },
        {
          ...party,
          name: extracted("XYZ BENIN SA"),
          role: extracted("customer"),
          role_other: extracted(null),
        },
      ],
      service: {
        description: extracted("Développement et maintenance d'une plateforme web"),
        category: extracted("IT services"),
        deliverables: [extracted("Application web"), extracted("Documentation")],
        location: extracted("Cotonou"),
      },
      financial: {
        amount: extracted(5000000),
        currency: extracted("XOF"),
        payment_terms: extracted("50% à la signature, 50% à la livraison"),
        payment_schedule: extracted(null),
      },
      duration: {
        start_date: extracted("2026-06-01"),
        end_date: extracted("2026-09-01"),
        duration: extracted(null),
      },
      signatures: {
        signed: extracted(true),
        signatories: [extracted("Awa Diop")],
      },
    },
  },
};

describe("BusinessActivitySchema", () => {
  it("accepts a normalized activity supported by an invoice", () => {
    expect(BusinessActivitySchema.safeParse(validInvoiceActivity).success)
      .toBe(true);
  });

  it("accepts a contract with distinct party roles and terms", () => {
    expect(BusinessActivitySchema.safeParse(validContractActivity).success)
      .toBe(true);
  });

  it("preserves customer role for the non-provider business rule", () => {
    const input = {
      ...validInvoiceActivity,
      activity: { ...validInvoiceActivity.activity, role: extracted("customer") },
    };
    const result = BusinessActivitySchema.safeParse(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.activity.role.value).toBe("customer");
    }
  });

  it("requires evidence to match its declared type", () => {
    const input = {
      ...validInvoiceActivity,
      evidence: {
        type: "invoice",
        contract: validContractActivity.evidence.contract,
      },
    };

    expect(BusinessActivitySchema.safeParse(input).success).toBe(false);
  });

  it("generates anyOf rather than oneOf for structured outputs", () => {
    const schema = z.toJSONSchema(BusinessActivitySchema);
    const evidence = schema.properties?.evidence;

    expect(evidence).toHaveProperty("anyOf");
    expect(evidence).not.toHaveProperty("oneOf");
  });
});
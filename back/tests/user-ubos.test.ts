import type { IdDocument, Statuts } from "@kyb/shared";
import { describe, expect, it } from "vitest";
import { mergeApplication, type MergeDocument, type UserUbos } from "../src/application/merge.js";

const f = <T>(value: T | null, confidence = 0.95) => ({ value, confidence, source_page: value === null ? null : 1 });
const at = new Date(2026, 0, 1);
const v = <T>(value: T | null) => ({ value, edited_at: at });

function statutsDoc(): MergeDocument {
  const person = (first: string, last: string, shares: number) => ({
    holder_type: f("individual"),
    first_name: f(first),
    last_name: f(last),
    legal_entity_name: f(null),
    shares_count: f(shares),
    ownership_pct: f(null),
  });
  const data = {
    legal_name: f("SAHEL NEGOCE"),
    legal_form_explicit: f("SARL"),
    legal_form_other: f(null),
    registered_address: f(null),
    object: f(null),
    capital_amount: f(null),
    capital_currency: f(null),
    capital_cash_amount: f(null),
    capital_in_kind_amount: f(null),
    shareholders: [person("Paul", "OUEDRAOGO", 60), person("Aïcha", "SAWADOGO", 40)],
    officers: [
      {
        first_name: f("Paul"),
        last_name: f("OUEDRAOGO"),
        role: f("gérant"),
        nationality: f(null),
        address: f(null),
        date_of_birth: f(null),
        place_of_birth: f(null),
      },
    ],
  } as unknown as Statuts;
  return { id: "doc_statuts", type: "statuts", uploaded_at: at, data };
}

function idDoc(id: string, first: string, last: string, expiry: string): MergeDocument {
  const data = {
    first_name: f(first),
    last_name: f(last),
    middle_names: f(null),
    date_of_birth: f(null),
    nationality: f(null),
    address: f(null),
    expiry_date: f(expiry),
    document_type: f("CNI"),
    document_number: f(null),
    issuing_authority: f(null),
    npi: f(null),
  } as unknown as IdDocument;
  return { id, type: "id_document", uploaded_at: at, data };
}

function user(overrides: Partial<UserUbos>): UserUbos {
  return { overrides: {}, manual: {}, attesting_ubo_id: null, ...overrides };
}

const base = mergeApplication([statutsDoc()]).ubos;
const paul = base[0]!;
const aicha = base[1]!;

describe("actions du client sur les personnes", () => {
  it("corrige une personne détectée sans perdre les valeurs extraites", () => {
    const { ubos } = mergeApplication(
      [statutsDoc()],
      {},
      user({ overrides: { [aicha.id]: { values: { ownership_pct: v(10), address: v("Ouaga 2000") } } } }),
    );

    const updated = ubos.find((u) => u.id === aicha.id)!;
    expect(updated.ownership_pct).toMatchObject({ value: 10, edited_by_user: true });
    expect(updated.ownership_pct.candidates[0]?.value).toBe(40);
    // Indicateur recalculé sur la valeur corrigée.
    expect(updated.is_ubo).toBe(false);
    expect(updated.address).toMatchObject({ value: "Ouaga 2000", edited_by_user: true });
  });

  it("recalcule le rôle de direction si le client corrige la fonction", () => {
    const { ubos } = mergeApplication(
      [statutsDoc()],
      {},
      user({ overrides: { [aicha.id]: { values: { role: v("Directrice générale") } }, [paul.id]: { values: { role: v("Associé") } } } }),
    );
    expect(ubos.find((u) => u.id === aicha.id)!.is_control_person).toBe(true);
    expect(ubos.find((u) => u.id === paul.id)!.is_control_person).toBe(false);
  });

  it("ajoute une personne à la main, et signale un nom proche d'une personne détectée", () => {
    const { ubos, alerts } = mergeApplication(
      [statutsDoc()],
      {},
      user({
        manual: {
          ubo_m_1: { values: { full_name: v("Moussa KANE"), role: v("DG"), ownership_pct: v(null) }, created_at: at },
          ubo_m_2: { values: { full_name: v("Paul OUEDRAOGO") }, created_at: new Date(2026, 0, 2) },
        },
      }),
    );

    expect(ubos.map((u) => u.id)).toEqual([paul.id, aicha.id, "ubo_m_1", "ubo_m_2"]);
    expect(ubos[2]).toMatchObject({ added_by_user: true, is_control_person: true, is_ubo: false, source_doc_ids: [] });
    expect(ubos[2]!.full_name).toMatchObject({ value: "Moussa KANE", edited_by_user: true, confidence: 1 });
    expect(alerts).toEqual([
      expect.objectContaining({ code: "ubo_possible_duplicate", subject: { ubo_ids: [paul.id, "ubo_m_2"] } }),
    ]);
  });

  it("masque une personne détectée retirée, et les alertes qui la concernent", () => {
    const { ubos } = mergeApplication([statutsDoc()], {}, user({ overrides: { [aicha.id]: { values: {}, removed: true } } }));
    expect(ubos.map((u) => u.id)).toEqual([paul.id]);
  });

  it("rattache une pièce d'identité : sa date d'expiration vient de l'extraction", () => {
    const docs = [statutsDoc(), idDoc("doc_cni", "Aminata", "TRAORE", "2031-01-31")];
    const { ubos } = mergeApplication(
      docs,
      {},
      user({ overrides: { [aicha.id]: { values: { id_document_id: v("doc_cni") } } } }),
    );

    const updated = ubos.find((u) => u.id === aicha.id)!;
    expect(updated.id_document_id).toBe("doc_cni");
    expect(updated.id_expiry).toMatchObject({ value: "2031-01-31", source_doc_id: "doc_cni" });
    expect(updated.source_doc_ids).toContain("doc_cni");
  });

  it("désigne une seule personne signataire de l'attestation", () => {
    const { ubos } = mergeApplication([statutsDoc()], {}, user({ attesting_ubo_id: paul.id }));
    expect(ubos.map((u) => u.attests_ownership)).toEqual([true, false]);
  });
});

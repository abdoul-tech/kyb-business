import type { Rccm } from "@kyb/shared";
import { describe, expect, it } from "vitest";
import { mergeApplication, type MergeDocument } from "../src/application/merge.js";
import { SOLE_PROPRIETOR_REASON } from "../src/application/sole-proprietorship.js";
import { isControlRole, isOwnerRole, isSoleProprietorship } from "../src/rules/ownership.js";

const f = <T>(value: T | null, confidence = 0.95) => ({ value, confidence, source_page: value === null ? null : 1 });

function person(first: string, last: string, role: string) {
  return {
    first_name: f(first),
    last_name: f(last),
    role: f(role),
    nationality: f(null),
    address: f(null),
    date_of_birth: f(null),
    place_of_birth: f(null),
  };
}

function rccm(overrides: Partial<Rccm> = {}): MergeDocument {
  const data = {
    legal_name: f("ETS KONATE COMMERCE"),
    trade_name: f(null),
    acronym: f(null),
    legal_form_explicit: f("Entreprise Individuelle"),
    legal_form_other: f(null),
    object: f(null),
    activity_start_date: f(null),
    rccm_number: f("CI-ABJ-2020-A-04567"),
    registration_date: f("2020-02-11"),
    country: f("CIV"),
    registered_address: f(null),
    activity: f("Commerce général"),
    secondary_activities: f(null),
    capital_amount: f(null),
    capital_currency: f(null),
    capital_cash_amount: f(null),
    capital_in_kind_amount: f(null),
    officers: [person("Moussa", "KONATE", "Propriétaire exploitant")],
    ...overrides,
  } as unknown as Rccm;
  return { id: "doc_rccm", type: "rccm", uploaded_at: new Date(2026, 0, 1), data };
}

describe("rôles", () => {
  it.each(["Propriétaire exploitant", "Exploitant", "Promotrice", "Titulaire", "Chef d'entreprise", "Propriétaire"])(
    "%s est un rôle de direction et de titulaire",
    (role) => {
      expect(isControlRole(role)).toBe(true);
      expect(isOwnerRole(role)).toBe(true);
    },
  );

  it("un gérant dirige mais n'est pas titulaire", () => {
    expect(isControlRole("Gérant")).toBe(true);
    expect(isOwnerRole("Gérant")).toBe(false);
  });
});

describe("isSoleProprietorship", () => {
  it("reconnaît la forme Bridge ou un numéro RCCM de personne physique (lettre A)", () => {
    expect(isSoleProprietorship("Sole Proprietorship", null)).toBe(true);
    expect(isSoleProprietorship(null, "CI-ABJ-2020-A-04567")).toBe(true);
    expect(isSoleProprietorship(null, "RB/COT/19 A 12345")).toBe(true);
    expect(isSoleProprietorship(null, "SN-DKR-2021-B-14327")).toBe(false);
    expect(isSoleProprietorship(null, null)).toBe(false);
  });

  it("donne la priorité à une forme juridique connue sur le numéro", () => {
    expect(isSoleProprietorship("Limited Liability Company (LLC)", "CI-ABJ-2020-A-04567")).toBe(false);
  });
});

describe("entreprise individuelle", () => {
  it("attribue 100 % au titulaire, déduit et signalé comme tel, et le marque UBO et dirigeant", () => {
    const { business, ubos } = mergeApplication([rccm()]);

    expect(business.entity_type.value).toBe("Sole Proprietorship");
    expect(ubos).toHaveLength(1);
    expect(ubos[0]!.ownership_pct).toMatchObject({ value: 100, edited_by_user: false, derived_reason: SOLE_PROPRIETOR_REASON });
    expect(ubos[0]).toMatchObject({ is_ubo: true, is_control_person: true });
  });

  it("se base sur le numéro RCCM quand la forme juridique n'est pas écrite", () => {
    const { ubos } = mergeApplication([rccm({ legal_form_explicit: f(null) })]);
    expect(ubos[0]!.ownership_pct.value).toBe(100);
  });

  it("prend la seule personne connue même si son rôle n'est pas celui de titulaire", () => {
    const { ubos } = mergeApplication([rccm({ officers: [person("Moussa", "KONATE", "Commerçant")] as never })]);
    expect(ubos[0]).toMatchObject({ is_ubo: true, is_control_person: true });
  });

  it("ne devine pas quand plusieurs personnes pourraient être titulaires", () => {
    const { ubos } = mergeApplication([
      rccm({ officers: [person("Moussa", "KONATE", "Commerçant"), person("Awa", "TRAORE", "Commerçante")] as never }),
    ]);
    expect(ubos.every((ubo) => ubo.ownership_pct.value === null)).toBe(true);
  });

  it("laisse toujours le dernier mot à la saisie du client", () => {
    const [owner] = mergeApplication([rccm()]).ubos;
    const { ubos } = mergeApplication([rccm()], {}, {
      overrides: { [owner!.id]: { values: { ownership_pct: { value: 60, edited_at: new Date() } } } },
      manual: {},
      attesting_ubo_id: null,
    });
    expect(ubos[0]!.ownership_pct).toMatchObject({ value: 60, edited_by_user: true });
    expect(ubos[0]!.ownership_pct.derived_reason).toBeUndefined();
  });

  it("ne s'applique pas à une SARL, même avec un gérant", () => {
    const { ubos } = mergeApplication([
      rccm({
        legal_form_explicit: f("SARL"),
        rccm_number: f("SN-DKR-2021-B-14327"),
        officers: [person("Moussa", "KONATE", "Gérant")] as never,
      }),
    ]);
    expect(ubos[0]!.ownership_pct.value).toBeNull();
    expect(ubos[0]!.is_ubo).toBe(false);
    expect(ubos[0]!.is_control_person).toBe(true);
  });
});

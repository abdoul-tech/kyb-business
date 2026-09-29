import type { DocumentTypeSlug, IdDocument, Rccm, Statuts } from "@kyb/shared";
import { describe, expect, it } from "vitest";
import { mergeApplication, type MergeDocument, type UserBusinessValues } from "../src/application/merge.js";
import { isControlRole } from "../src/rules/ownership.js";

const f = <T>(value: T | null, confidence = 0.95, source_page: number | null = 1) => ({
  value,
  confidence,
  source_page,
});
const empty = () => f(null, 0, null);

function officer(first: string, last: string, extra: Partial<Statuts["officers"][number]> = {}) {
  return {
    first_name: f(first),
    last_name: f(last),
    role: empty(),
    nationality: empty(),
    address: empty(),
    date_of_birth: empty(),
    place_of_birth: empty(),
    ...extra,
  } as Statuts["officers"][number];
}

function rccm(overrides: Partial<Rccm> = {}): Rccm {
  return {
    legal_name: f("BARRY AUTO SARL"),
    trade_name: empty(),
    acronym: empty(),
    legal_form_explicit: empty(),
    legal_form_other: empty(),
    object: empty(),
    activity_start_date: empty(),
    rccm_number: f("NE-NIM-01-2019-B12-00987"),
    registration_date: f("2019-03-14"),
    country: f("NER"),
    registered_address: f({ full_address: "Quartier Plateau, Niamey", raw_components: null }),
    activity: f("Commerce de véhicules"),
    secondary_activities: empty(),
    capital_amount: f(1_000_000),
    capital_currency: f("XOF"),
    capital_cash_amount: empty(),
    capital_in_kind_amount: empty(),
    officers: [officer("Ibrahim Moussa", "BARRY", { role: f("Gérant"), date_of_birth: f("1980-01-01") })],
    ...overrides,
  } as Rccm;
}

function statuts(overrides: Partial<Statuts> = {}): Statuts {
  return {
    legal_name: f("BARRY AUTO SARL"),
    legal_form_explicit: f("société à responsabilité limitée", 0.9, 1),
    legal_form_other: empty(),
    registered_address: f({ full_address: "quartier plateau,  NIAMEY", raw_components: [{ label: "ville", value: "Niamey" }] }),
    object: f("La société a pour objet le commerce de véhicules neufs et d'occasion…"),
    capital_amount: f(1_000_000),
    capital_currency: f("XOF"),
    capital_cash_amount: empty(),
    capital_in_kind_amount: empty(),
    shareholders: [
      {
        holder_type: f("individual"),
        first_name: f("Ibrahim"),
        last_name: f("BARRY"),
        legal_entity_name: empty(),
        shares_count: f(70),
        ownership_pct: empty(),
      },
      {
        holder_type: f("individual"),
        first_name: f("Mariama"),
        last_name: f("DIALLO"),
        legal_entity_name: empty(),
        shares_count: f(30),
        ownership_pct: empty(),
      },
      {
        holder_type: f("legal_entity"),
        first_name: empty(),
        last_name: empty(),
        legal_entity_name: f("HOLDING X SA"),
        shares_count: f(0),
        ownership_pct: empty(),
      },
    ],
    officers: [officer("Ibrahim", "BARRY", { role: f("gérant") })],
    ...overrides,
  } as Statuts;
}

function idDocument(overrides: Partial<IdDocument> = {}): IdDocument {
  return {
    first_name: f("IBRAHIM"),
    last_name: f("BARRY"),
    middle_names: f("MOUSSA"),
    date_of_birth: f("1980-01-01"),
    nationality: f("NIGERIENNE"),
    address: empty(),
    expiry_date: f("2030-06-30"),
    document_type: f("Passeport"),
    document_number: f("P0001"),
    issuing_authority: empty(),
    npi: empty(),
    ...overrides,
  } as IdDocument;
}

let seq = 0;
function doc(type: DocumentTypeSlug, data: unknown, uploadedAt = new Date(2026, 0, 1 + seq)): MergeDocument {
  seq++;
  return { id: `doc_${type}_${seq}`, type, uploaded_at: uploadedAt, data };
}

describe("fusion des champs de l'entreprise", () => {
  it("applique la priorité des sources et garde tous les candidats", () => {
    const r = doc("rccm", rccm({ legal_name: f("BARRY AUTO SARL", 0.8) }));
    const s = doc("statuts", statuts({ legal_name: f("BARRY AUTO SARL", 0.99) }));

    const { business } = mergeApplication([s, r]);

    // legal_name : rccm > statuts, même si les statuts sont plus confiants.
    expect(business.legal_name).toMatchObject({ value: "BARRY AUTO SARL", source_doc_id: r.id, conflict: false });
    expect(business.legal_name.candidates.map((c) => c.source_doc_id)).toEqual([r.id, s.id]);
    // legal_form_local : statuts > rccm (et le RCCM n'a pas de mention explicite).
    expect(business.legal_form_local).toMatchObject({ value: "société à responsabilité limitée", source_doc_id: s.id });
    expect(business.registration_number.value).toBe("NE-NIM-01-2019-B12-00987");
    expect(business.incorporation_date.value).toBe("2019-03-14");
    expect(business.share_capital.value).toEqual({ amount: 1_000_000, currency: "XOF" });
  });

  it("déduit la forme Bridge de la mention explicite, jamais du sigle du nom (cas SAIDOU AUTO)", () => {
    const withMention = mergeApplication([doc("statuts", statuts())]).business;
    expect(withMention.entity_type).toMatchObject({ value: "Limited Liability Company (LLC)", confidence: 0.9 });

    const withoutMention = mergeApplication([doc("rccm", rccm())]).business;
    expect(withoutMention.legal_name.value).toBe("BARRY AUTO SARL");
    expect(withoutMention.entity_type.value).toBeNull();
  });

  it("signale un conflit (confiance plafonnée à 0,5) quand deux documents divergent", () => {
    const { business, alerts } = mergeApplication([
      doc("rccm", rccm({ legal_name: f("BARRY AUTO SARL", 0.95) })),
      doc("statuts", statuts({ legal_name: f("BARRY AUTOMOBILES SARL", 0.95) })),
    ]);

    expect(business.legal_name).toMatchObject({ value: "BARRY AUTO SARL", confidence: 0.5, conflict: true });
    expect(alerts).toContainEqual(
      expect.objectContaining({ code: "field_conflict", subject: { field: "business.legal_name" } }),
    );
  });

  it("ne crée pas de conflit pour une différence de casse, d'accents, d'espaces ou de découpage d'adresse", () => {
    const { business, alerts } = mergeApplication([doc("rccm", rccm()), doc("statuts", statuts())]);

    expect(business.registered_address.conflict).toBe(false);
    // L'objet social des statuts n'est qu'un repli, pas un concurrent de l'activité du RCCM.
    expect(business.activity).toMatchObject({ value: "Commerce de véhicules", conflict: false });
    expect(alerts.filter((a) => a.code === "field_conflict")).toEqual([]);
  });

  it("prend l'objet social des statuts comme activité en l'absence de RCCM", () => {
    const { business } = mergeApplication([doc("statuts", statuts())]);
    expect(business.activity.value).toContain("commerce de véhicules neufs");
  });

  it("ne laisse jamais une extraction écraser une saisie du client", () => {
    const user: UserBusinessValues = {
      legal_name: { value: "BARRY AUTO", edited_at: new Date() },
      email: { value: "contact@barry.example", edited_at: new Date() },
      website: { value: null, edited_at: new Date() },
    };
    const { business } = mergeApplication([doc("rccm", rccm()), doc("statuts", statuts())], user);

    expect(business.legal_name).toMatchObject({ value: "BARRY AUTO", edited_by_user: true, confidence: 1, source_doc_id: null });
    // Les candidats extraits restent visibles pour comparaison.
    expect(business.legal_name.candidates).toHaveLength(2);
    expect(business.email).toMatchObject({ value: "contact@barry.example", edited_by_user: true });
    expect(business.website).toMatchObject({ value: null, edited_by_user: true });
  });

  it("recalcule la forme Bridge si le client corrige la forme locale, sauf saisie directe", () => {
    const now = new Date();
    const corrected = mergeApplication([doc("rccm", rccm())], {
      legal_form_local: { value: "Société anonyme", edited_at: now },
    }).business;
    expect(corrected.entity_type).toMatchObject({ value: "Corporation", edited_by_user: true });

    const direct = mergeApplication([doc("statuts", statuts())], {
      entity_type: { value: "Cooperative", edited_at: now },
    }).business;
    expect(direct.entity_type).toMatchObject({ value: "Cooperative", edited_by_user: true });
  });

  it("donne les valeurs par défaut de la spec et laisse vides les champs client non saisis", () => {
    const { business } = mergeApplication([]);
    expect(business.dao).toMatchObject({ value: false, edited_by_user: false });
    expect(business.money_transmission.value).toBe(false);
    expect(business.email).toMatchObject({ value: null, confidence: 0 });
    expect(business.legal_name.value).toBeNull();
  });

  it("retire les candidats d'un document supprimé (fusion recalculée)", () => {
    const r = doc("rccm", rccm());
    const s = doc("statuts", statuts({ legal_name: f("BARRY AUTOMOBILES SARL") }));
    expect(mergeApplication([r, s]).business.legal_name.conflict).toBe(true);

    const afterDelete = mergeApplication([s]).business.legal_name;
    expect(afterDelete).toMatchObject({ value: "BARRY AUTOMOBILES SARL", conflict: false, source_doc_id: s.id });
  });
});

describe("rapprochement des UBO", () => {
  it("fusionne associé, gérant (statuts), dirigeant (RCCM) et passeport en une seule fiche", () => {
    const s = doc("statuts", statuts());
    const r = doc("rccm", rccm());
    const id = doc("id_document", idDocument());

    const { ubos, alerts } = mergeApplication([id, r, s]);

    const barry = ubos.find((u) => u.source_doc_ids.includes(id.id))!;
    expect(barry.source_doc_ids.sort()).toEqual([id.id, r.id, s.id].sort());
    // Nom et date de naissance : la pièce d'identité fait foi.
    expect(barry.full_name).toMatchObject({ value: "IBRAHIM MOUSSA BARRY", source_doc_id: id.id, conflict: false });
    expect(barry.dob).toMatchObject({ value: "1980-01-01", source_doc_id: id.id });
    // Pourcentage calculé depuis le nombre de parts (70 / 100).
    expect(barry.ownership_pct.value).toBe(70);
    expect(barry.role).toMatchObject({ value: "Gérant", source_doc_id: r.id });
    expect(barry).toMatchObject({ is_ubo: true, is_control_person: true, id_document_id: id.id });
    expect(barry.id_expiry.value).toBe("2030-06-30");
    expect(alerts.filter((a) => a.code === "ubo_possible_duplicate")).toEqual([]);
  });

  it("garde les associés minoritaires sans rôle, et écarte les personnes morales", () => {
    const { ubos } = mergeApplication([doc("statuts", statuts())]);

    expect(ubos.map((u) => u.full_name.value)).toEqual(["Ibrahim BARRY", "Mariama DIALLO"]);
    const diallo = ubos[1]!;
    expect(diallo).toMatchObject({ is_ubo: true, is_control_person: false });
    expect(diallo.ownership_pct.value).toBe(30);
  });

  it("ne fusionne pas deux homonymes dont les dates de naissance diffèrent, et le signale", () => {
    const { ubos, alerts } = mergeApplication([
      doc("rccm", rccm()),
      doc("id_document", idDocument({ date_of_birth: f("1955-07-12"), middle_names: empty() })),
    ]);

    expect(ubos).toHaveLength(2);
    expect(alerts).toContainEqual(
      expect.objectContaining({ code: "ubo_possible_duplicate", subject: { ubo_ids: [ubos[0]!.id, ubos[1]!.id] } }),
    );
  });

  it("signale un nom proche sous le seuil sans fusionner", () => {
    const { ubos, alerts } = mergeApplication([
      doc("statuts", statuts({ officers: [], shareholders: [statuts().shareholders[0]!] })),
      // « Ibrahim BARRY » / « IBRAHIM BAH » : similarité ≈ 0,86, entre 0,85 et 0,92.
      doc("id_document", idDocument({ first_name: f("IBRAHIM"), last_name: f("BAH"), middle_names: empty(), date_of_birth: empty() })),
    ]);

    expect(ubos).toHaveLength(2);
    expect(alerts.map((a) => a.code)).toContain("ubo_possible_duplicate");
  });

  it("donne des identifiants stables quand on ajoute une pièce d'identité", () => {
    const s = doc("statuts", statuts());
    const before = mergeApplication([s]).ubos.map((u) => u.id);
    const after = mergeApplication([s, doc("id_document", idDocument())]).ubos.map((u) => u.id);
    expect(after).toEqual(before);
  });
});

describe("isControlRole", () => {
  it.each(["Gérant", "co-gérante", "PDG", "Directeur Général", "Président du Conseil d'Administration", "PCA", "DG"])(
    "%s est un rôle de direction",
    (role) => expect(isControlRole(role)).toBe(true),
  );

  it.each(["Administrateur", "Associé", "Commissaire aux comptes", "Secrétaire"])("%s n'en est pas un", (role) =>
    expect(isControlRole(role)).toBe(false),
  );
});

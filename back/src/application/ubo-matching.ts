import { createHash } from "node:crypto";
import {
  jaroWinkler,
  normalizeName,
  type DocumentTypeSlug,
  type IdDocument,
  type MergeAlert,
  type OwnershipDocument,
  type Rccm,
  type Statuts,
  type UboView,
} from "@kyb/shared";
import { isControlRole, UBO_OWNERSHIP_THRESHOLD } from "../rules/ownership.js";
import { candidateFrom, resolveField, type SourceDocument, type SourcedCandidate } from "./fields.js";

// Spec, « Rapprochement des UBO » : même personne si similarité ≥ 0,92 sur les noms normalisés (mots triés).
export const NAME_MATCH_THRESHOLD = 0.92;
// En dessous du seuil mais proche : pas de fusion, alerte `ubo_possible_duplicate` que le client résout.
export const NAME_NEAR_MATCH_THRESHOLD = 0.85;

type Extracted<T> = { value: T | null; confidence: number; source_page: number | null };

// Une mention d'une personne dans un document.
type Mention = {
  doc: SourceDocument;
  name: Extracted<string>;
  key: string;
  role?: Extracted<string>;
  ownership_pct?: Extracted<number>;
  dob?: Extracted<string>;
  nationality?: Extracted<string>;
  address?: Extracted<string>;
  id_expiry?: Extracted<string>;
};

export type MergeDocument = SourceDocument & { data: unknown };

// Ordre de constitution des fiches : la première mention d'une fiche fixe son identifiant, qui doit rester stable
// quand on ajoute une pièce d'identité.
const MENTION_ORDER: readonly DocumentTypeSlug[] = ["statuts", "ownership_document", "rccm", "id_document"];

const FIELD_PRIORITY = {
  full_name: ["id_document", "statuts", "ownership_document", "rccm"],
  role: ["rccm", "statuts"],
  ownership_pct: ["ownership_document", "statuts"],
  dob: ["id_document", "statuts", "rccm"],
  nationality: ["id_document", "rccm", "statuts"],
  address: ["id_document", "statuts", "rccm"],
  id_expiry: ["id_document"],
} as const satisfies Record<string, readonly DocumentTypeSlug[]>;

// Nom complet et sa confiance (la plus faible des parties présentes).
function fullName(parts: Array<Extracted<string> | undefined>): Extracted<string> | null {
  const present = parts.filter((part): part is Extracted<string> => !!part && !!part.value);
  if (present.length === 0) {
    return null;
  }
  return {
    value: present.map((part) => part.value).join(" "),
    confidence: Math.min(...present.map((part) => part.confidence)),
    source_page: present[0]!.source_page,
  };
}

type Person = {
  first_name: Extracted<string>;
  last_name: Extracted<string>;
  middle_names?: Extracted<string>;
};

function nameOf(person: Person): Extracted<string> | null {
  return fullName([person.first_name, person.middle_names, person.last_name]);
}

// Spec, « Pourcentages » : calculé depuis le nombre de parts si seul le nombre est donné.
function shareholderMentions(doc: MergeDocument, shareholders: Statuts["shareholders"]): Mention[] {
  const totalShares = shareholders.reduce((sum, s) => sum + (s.shares_count.value ?? 0), 0);
  const mentions: Mention[] = [];
  for (const shareholder of shareholders) {
    // Les associés personnes morales ne sont pas des UBO (règle `ownership_incomplete`, J4).
    if (shareholder.holder_type.value === "legal_entity") {
      continue;
    }
    const name = nameOf(shareholder);
    if (!name) {
      continue;
    }
    let pct: Extracted<number> = shareholder.ownership_pct;
    if (pct.value === null && shareholder.shares_count.value !== null && totalShares > 0) {
      pct = {
        value: Math.round((shareholder.shares_count.value / totalShares) * 10_000) / 100,
        confidence: shareholder.shares_count.confidence,
        source_page: shareholder.shares_count.source_page,
      };
    }
    mentions.push({ doc, name, key: normalizeName(name.value!), ownership_pct: pct });
  }
  return mentions;
}

function officerMentions(doc: MergeDocument, officers: Statuts["officers"]): Mention[] {
  return officers.flatMap((officer) => {
    const name = nameOf(officer);
    if (!name) {
      return [];
    }
    return [
      {
        doc,
        name,
        key: normalizeName(name.value!),
        role: officer.role,
        dob: officer.date_of_birth,
        nationality: officer.nationality,
        address: officer.address,
      },
    ];
  });
}

function mentionsOf(doc: MergeDocument): Mention[] {
  switch (doc.type) {
    case "statuts": {
      const data = doc.data as Statuts;
      return [...shareholderMentions(doc, data.shareholders), ...officerMentions(doc, data.officers)];
    }
    case "ownership_document":
      return shareholderMentions(doc, (doc.data as OwnershipDocument).shareholders);
    case "rccm":
      return officerMentions(doc, (doc.data as Rccm).officers);
    case "id_document": {
      const data = doc.data as IdDocument;
      const name = nameOf(data);
      if (!name) {
        return [];
      }
      return [
        {
          doc,
          name,
          key: normalizeName(name.value!),
          dob: data.date_of_birth,
          nationality: data.nationality,
          address: data.address,
          id_expiry: data.expiry_date,
        },
      ];
    }
    default:
      return [];
  }
}

type Cluster = { mentions: Mention[] };

function dobOf(cluster: Cluster): Set<string> {
  return new Set(cluster.mentions.map((m) => m.dob?.value).filter((dob): dob is string => !!dob));
}

// Similarité avec une fiche : meilleur score sur toutes ses mentions. Deux dates de naissance connues et
// différentes excluent le rapprochement.
function similarity(mention: Mention, cluster: Cluster): { score: number; dobConflict: boolean } {
  const score = Math.max(...cluster.mentions.map((m) => jaroWinkler(mention.key, m.key)));
  const dobs = dobOf(cluster);
  const dobConflict = !!mention.dob?.value && dobs.size > 0 && !dobs.has(mention.dob.value);
  return { score, dobConflict };
}

function candidates<K extends keyof Omit<Mention, "doc" | "key">, T>(
  cluster: Cluster,
  key: K,
): SourcedCandidate<T>[] {
  return cluster.mentions.flatMap((m) => candidateFrom<T>(m.doc, m[key] as Extracted<T> | undefined));
}

function sameName(a: string, b: string): boolean {
  return jaroWinkler(normalizeName(a), normalizeName(b)) >= NAME_MATCH_THRESHOLD;
}

function uboId(cluster: Cluster, taken: Set<string>): string {
  const base = `ubo_${createHash("sha256").update(cluster.mentions[0]!.key).digest("hex").slice(0, 12)}`;
  let id = base;
  for (let n = 2; taken.has(id); n++) {
    id = `${base}_${n}`;
  }
  taken.add(id);
  return id;
}

function toView(cluster: Cluster, id: string): UboView {
  const ownership = resolveField<number>(candidates(cluster, "ownership_pct"), FIELD_PRIORITY.ownership_pct);
  const role = resolveField<string>(candidates(cluster, "role"), FIELD_PRIORITY.role);
  const idExpiry = resolveField<string>(candidates(cluster, "id_expiry"), FIELD_PRIORITY.id_expiry);
  const idDocs = cluster.mentions.filter((m) => m.doc.type === "id_document");

  return {
    id,
    full_name: resolveField<string>(
      cluster.mentions.flatMap((m) => candidateFrom<string>(m.doc, m.name)),
      FIELD_PRIORITY.full_name,
      { same: sameName },
    ),
    role,
    ownership_pct: ownership,
    is_ubo: (ownership.value ?? 0) >= UBO_OWNERSHIP_THRESHOLD,
    is_control_person: role.candidates.some((candidate) => isControlRole(candidate.value)),
    attests_ownership: false,
    dob: resolveField<string>(candidates(cluster, "dob"), FIELD_PRIORITY.dob),
    nationality: resolveField<string>(candidates(cluster, "nationality"), FIELD_PRIORITY.nationality),
    address: resolveField<string>(candidates(cluster, "address"), FIELD_PRIORITY.address),
    // Pièce retenue : celle de la date d'expiration retenue, sinon la plus récente.
    id_document_id:
      idExpiry.source_doc_id ??
      idDocs.sort((a, b) => b.doc.uploaded_at.getTime() - a.doc.uploaded_at.getTime())[0]?.doc.id ??
      null,
    id_expiry: idExpiry,
    source_doc_ids: [...new Set(cluster.mentions.map((m) => m.doc.id))],
  };
}

function orderOf(doc: SourceDocument): number {
  const index = MENTION_ORDER.indexOf(doc.type);
  return index === -1 ? MENTION_ORDER.length : index;
}

export function matchUbos(documents: MergeDocument[]): { ubos: UboView[]; alerts: MergeAlert[] } {
  const ordered = [...documents].sort(
    (a, b) => orderOf(a) - orderOf(b) || a.uploaded_at.getTime() - b.uploaded_at.getTime() || a.id.localeCompare(b.id),
  );

  const clusters: Cluster[] = [];
  const nearMisses: Array<[Cluster, Cluster]> = [];

  for (const mention of ordered.flatMap(mentionsOf)) {
    let best: { cluster: Cluster; score: number } | null = null;
    let near: Cluster | null = null;
    for (const cluster of clusters) {
      const { score, dobConflict } = similarity(mention, cluster);
      if (score >= NAME_MATCH_THRESHOLD && !dobConflict) {
        if (!best || score > best.score) {
          best = { cluster, score };
        }
      } else if (score >= NAME_NEAR_MATCH_THRESHOLD) {
        // Nom proche, ou même nom avec une autre date de naissance : le client tranche.
        near = cluster;
      }
    }

    if (best) {
      best.cluster.mentions.push(mention);
    } else {
      const created: Cluster = { mentions: [mention] };
      clusters.push(created);
      if (near) {
        nearMisses.push([near, created]);
      }
    }
  }

  const taken = new Set<string>();
  const ids = new Map<Cluster, string>();
  const ubos = clusters.map((cluster) => {
    const id = uboId(cluster, taken);
    ids.set(cluster, id);
    return toView(cluster, id);
  });

  const alerts: MergeAlert[] = nearMisses.map(([a, b]) => ({
    code: "ubo_possible_duplicate",
    severity: "warning",
    message_fr: `« ${a.mentions[0]!.name.value} » et « ${b.mentions[0]!.name.value} » sont peut-être la même personne : confirmez ou corrigez.`,
    subject: { ubo_ids: [ids.get(a)!, ids.get(b)!] },
  }));

  return { ubos, alerts };
}

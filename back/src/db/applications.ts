import { randomBytes, randomUUID, createHash } from "node:crypto";
import type { Application, ApplicationStatus, BusinessFieldKey, BusinessValues } from "@kyb/shared";
import type { UboFieldKey, UboValues } from "@kyb/shared";
import type { UserBusinessValues, UserUbos } from "../application/merge.js";
import { getDb } from "./client.js";

export type ApplicationDocument = {
  _id: string;
  status: ApplicationStatus;
  access_token_hash: string;
  // Valeurs saisies ou corrigées par le client (autosave). Les champs extraits ne sont pas stockés ici :
  // ils sont recalculés à chaque lecture depuis les documents (voir application/merge.ts).
  user_business?: UserBusinessValues;
  // Corrections, ajouts et retraits de personnes par le client, et signataire de l'attestation.
  user_ubos?: UserUbos;
  created_at: Date;
  updated_at: Date;
  submitted_at: Date | null;
};

const COLLECTION = "applications";

function collection() {
  return getDb().collection<ApplicationDocument>(COLLECTION);
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createApplication(): Promise<{ id: string; accessToken: string }> {
  const id = `app_${randomUUID()}`;
  const accessToken = randomBytes(32).toString("hex");
  const now = new Date();

  await collection().insertOne({
    _id: id,
    status: "draft",
    access_token_hash: hashToken(accessToken),
    user_business: {},
    created_at: now,
    updated_at: now,
    submitted_at: null,
  });

  return { id, accessToken };
}

export async function findApplicationById(id: string): Promise<ApplicationDocument | null> {
  return collection().findOne({ _id: id });
}

// Enregistre les valeurs envoyées par le client, champ par champ : un autosave ne touche que ce qu'il contient.
// `revert` supprime la saisie de ces champs : la fusion suivante redonne la valeur des documents.
export async function saveUserBusinessValues(
  id: string,
  values: { [K in BusinessFieldKey]?: BusinessValues[K] | null },
  revert: BusinessFieldKey[] = [],
): Promise<void> {
  const now = new Date();
  const set: Record<string, unknown> = { updated_at: now };
  for (const [key, value] of Object.entries(values)) {
    set[`user_business.${key}`] = { value, edited_at: now };
  }
  const unset = Object.fromEntries(revert.map((key) => [`user_business.${key}`, "" as const]));
  await collection().updateOne({ _id: id }, revert.length > 0 ? { $set: set, $unset: unset } : { $set: set });
}

export type UboValuesInput = { [K in UboFieldKey]?: UboValues[K] | null } & { id_document_id?: string | null };

function uboPath(uboId: string, manual: boolean): string {
  return manual ? `user_ubos.manual.${uboId}` : `user_ubos.overrides.${uboId}`;
}

function valueSets(prefix: string, values: UboValuesInput, now: Date): Record<string, unknown> {
  const set: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) {
      set[`${prefix}.values.${key}`] = { value, edited_at: now };
    }
  }
  return set;
}

export async function addManualUbo(applicationId: string, uboId: string, values: UboValuesInput): Promise<void> {
  const now = new Date();
  await collection().updateOne(
    { _id: applicationId },
    {
      $set: {
        [`${uboPath(uboId, true)}.created_at`]: now,
        ...valueSets(uboPath(uboId, true), values, now),
        updated_at: now,
      },
    },
  );
}

// Enregistre les corrections d'une personne (détectée ou ajoutée) et, si demandé, le signataire de l'attestation.
export async function saveUboValues(
  applicationId: string,
  uboId: string,
  manual: boolean,
  values: UboValuesInput,
  attesting?: { attesting_ubo_id: string | null },
  revert: string[] = [],
): Promise<void> {
  const now = new Date();
  const set = {
    ...valueSets(uboPath(uboId, manual), values, now),
    ...(attesting ? { "user_ubos.attesting_ubo_id": attesting.attesting_ubo_id } : {}),
    updated_at: now,
  };
  const unset = Object.fromEntries(revert.map((key) => [`${uboPath(uboId, manual)}.values.${key}`, "" as const]));
  await collection().updateOne(
    { _id: applicationId },
    revert.length > 0 ? { $set: set, $unset: unset } : { $set: set },
  );
}

// Une personne ajoutée est supprimée ; une personne détectée est masquée (elle reviendrait à la fusion suivante).
export async function removeUbo(applicationId: string, uboId: string, manual: boolean, wasAttesting: boolean): Promise<void> {
  const now = new Date();
  const set: Record<string, unknown> = { updated_at: now };
  if (!manual) {
    set[`${uboPath(uboId, false)}.removed`] = true;
  }
  if (wasAttesting) {
    set["user_ubos.attesting_ubo_id"] = null;
  }
  await collection().updateOne(
    { _id: applicationId },
    manual ? { $set: set, $unset: { [uboPath(uboId, true)]: "" } } : { $set: set },
  );
}

export function toPublicApplication(doc: ApplicationDocument): Application {
  return {
    id: doc._id,
    status: doc.status,
    created_at: doc.created_at.toISOString(),
    updated_at: doc.updated_at.toISOString(),
    submitted_at: doc.submitted_at ? doc.submitted_at.toISOString() : null,
  };
}

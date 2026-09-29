import { randomBytes, randomUUID, createHash } from "node:crypto";
import type { Application, ApplicationStatus, BusinessFieldKey, BusinessValues } from "@kyb/shared";
import type { UserBusinessValues } from "../application/merge.js";
import { getDb } from "./client.js";

export type ApplicationDocument = {
  _id: string;
  status: ApplicationStatus;
  access_token_hash: string;
  // Valeurs saisies ou corrigées par le client (autosave). Les champs extraits ne sont pas stockés ici :
  // ils sont recalculés à chaque lecture depuis les documents (voir application/merge.ts).
  user_business?: UserBusinessValues;
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
export async function saveUserBusinessValues(
  id: string,
  values: { [K in BusinessFieldKey]?: BusinessValues[K] | null },
): Promise<void> {
  const now = new Date();
  const set: Record<string, unknown> = { updated_at: now };
  for (const [key, value] of Object.entries(values)) {
    set[`user_business.${key}`] = { value, edited_at: now };
  }
  await collection().updateOne({ _id: id }, { $set: set });
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

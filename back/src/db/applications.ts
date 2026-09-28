import { randomBytes, randomUUID, createHash } from "node:crypto";
import type { Application, ApplicationStatus } from "@kyb/shared";
import { getDb } from "./client.js";

export type ApplicationDocument = {
  _id: string;
  status: ApplicationStatus;
  access_token_hash: string;
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
    created_at: now,
    updated_at: now,
    submitted_at: null,
  });

  return { id, accessToken };
}

export async function findApplicationById(id: string): Promise<ApplicationDocument | null> {
  return collection().findOne({ _id: id });
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

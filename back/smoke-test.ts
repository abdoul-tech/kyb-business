// Parcours API de bout en bout sur le Mongo et le MinIO locaux (config de back/.env).
// Utilise une base et un bucket dédiés, supprimés à la fin : `npm run test:smoke --workspace=back`.
import assert from "node:assert/strict";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { makePdf, PNG_1X1 } from "./tests/helpers/pdf.js";

process.loadEnvFile(".env");
process.env.MONGO_URL = "mongodb://localhost:27017/kyb_smoke";
process.env.S3_BUCKET = "kyb-smoke";
process.env.PORT = "4123";

const { env } = await import("./src/config/env.js");
const { connectMongo, closeMongo, getDb } = await import("./src/db/client.js");
const { ensureDocumentIndexes } = await import("./src/db/documents.js");
const { ensureBucket, deleteObject } = await import("./src/documents/storage.js");
const { createApp } = await import("./src/app.js");

const base = `http://localhost:${env.PORT}/v1/applications`;

function upload(id: string, token: string, files: Array<{ name: string; content: Buffer; type: string }>) {
  const form = new FormData();
  for (const file of files) {
    form.append("file", new Blob([new Uint8Array(file.content)], { type: file.type }), file.name);
  }
  return fetch(`${base}/${id}/documents`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
}

function step(label: string) {
  console.log(`✓ ${label}`);
}

await connectMongo();
await ensureDocumentIndexes();
await ensureBucket();
const server = createApp().listen(env.PORT);
const storedKeys: string[] = [];

try {
  const created = await fetch(base, { method: "POST" });
  assert.equal(created.status, 201);
  const { application_id: id, access_token: token } = await created.json();
  const auth = { Authorization: `Bearer ${token}` };
  step("création du dossier");

  assert.equal((await fetch(`${base}/${id}`, { headers: { Authorization: "Bearer faux" } })).status, 401);
  step("jeton invalide refusé (401)");

  const pdf = makePdf(2);
  const first = await upload(id, token, [
    { name: "rccm.pdf", content: pdf, type: "application/pdf" },
    { name: "cni.png", content: PNG_1X1, type: "image/png" },
  ]);
  assert.equal(first.status, 202);
  const { documents } = await first.json();
  assert.equal(documents.length, 2);
  assert.deepEqual(
    documents.map((d: { page_count: number; status: string }) => [d.page_count, d.status]),
    [
      [2, "uploaded"],
      [1, "uploaded"],
    ],
  );
  step("upload PDF + PNG (202, pages comptées)");

  // Traitement async : sans LLM branché, la classification renvoie `unknown` → le client doit choisir le type.
  const deadline = Date.now() + 10_000;
  let statuses: string[] = [];
  while (Date.now() < deadline) {
    const current = await (await fetch(`${base}/${id}`, { headers: auth })).json();
    statuses = current.documents.map((d: { status: string }) => d.status);
    if (statuses.every((status) => status === "needs_type_confirmation")) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.deepEqual(statuses, ["needs_type_confirmation", "needs_type_confirmation"]);
  step("traitement async : uploaded → classifying → needs_type_confirmation");

  const record = await getDb().collection("documents").findOne({ _id: documents[0].id });
  assert.ok(record);
  storedKeys.push(record.storage_key, `applications/${id}/${documents[1].id}`);
  assert.equal(record.storage_key, `applications/${id}/${documents[0].id}`);

  const raw = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: true,
    credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
  });
  const object = await raw.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: record.storage_key }));
  const storedBytes = Buffer.from(await object.Body!.transformToByteArray());
  assert.equal(storedBytes.includes(Buffer.from("%PDF")), false);
  step("fichier chiffré dans MinIO (pas de %PDF en clair)");

  const { getDecryptedObject } = await import("./src/documents/storage.js");
  assert.ok((await getDecryptedObject(record.storage_key)).equals(pdf));
  step("déchiffrement identique à l'original");

  const duplicate = await upload(id, token, [{ name: "rccm-copie.pdf", content: pdf, type: "application/pdf" }]);
  assert.equal(duplicate.status, 202);
  assert.equal((await duplicate.json()).documents[0].id, documents[0].id);
  step("doublon (même hash) → document existant");

  const txt = await upload(id, token, [{ name: "notes.pdf", content: Buffer.from("texte"), type: "application/pdf" }]);
  assert.equal(txt.status, 415);
  assert.equal((await txt.json()).error.code, "UNSUPPORTED_FILE_TYPE");
  step("faux PDF refusé (415 UNSUPPORTED_FILE_TYPE)");

  const long = await upload(id, token, [{ name: "long.pdf", content: makePdf(31), type: "application/pdf" }]);
  assert.equal(long.status, 413);
  assert.equal((await long.json()).error.code, "TOO_MANY_PAGES");
  step("31 pages refusé (413 TOO_MANY_PAGES)");

  const big = await upload(id, token, [
    { name: "gros.pdf", content: Buffer.alloc(env.MAX_FILE_BYTES + 1), type: "application/pdf" },
  ]);
  assert.equal(big.status, 413);
  assert.equal((await big.json()).error.code, "FILE_TOO_LARGE");
  step("fichier > 15 Mo refusé (413 FILE_TOO_LARGE)");

  const mixed = await upload(id, token, [
    { name: "ok.pdf", content: makePdf(1), type: "application/pdf" },
    { name: "ko.pdf", content: Buffer.from("texte"), type: "application/pdf" },
  ]);
  assert.equal(mixed.status, 415);
  const after = await (await fetch(`${base}/${id}`, { headers: auth })).json();
  assert.equal(after.documents.length, 2);
  step("envoi mixte refusé en bloc, rien de stocké");

  const docId = documents[0].id;
  assert.equal((await fetch(`${base}/${id}/documents/${docId}`, { method: "DELETE", headers: auth })).status, 204);
  assert.equal((await fetch(`${base}/${id}/documents/${docId}`, { headers: auth })).status, 404);
  const gone = await raw
    .send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: record.storage_key }))
    .then(() => false)
    .catch(() => true);
  assert.ok(gone);
  step("suppression : document et objet MinIO supprimés");

  console.log("\nSmoke test OK");
} finally {
  server.close();
  await Promise.all(storedKeys.map((key) => deleteObject(key).catch(() => undefined)));
  await getDb().dropDatabase();
  await closeMongo();
}

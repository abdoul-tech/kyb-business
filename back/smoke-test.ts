// Parcours API de bout en bout sur le Mongo et le MinIO locaux (config de back/.env).
// Utilise une base et un bucket dédiés, supprimés à la fin : `npm run test:smoke --workspace=back`.
// LLM en replay : les documents fictifs sont classés et extraits à partir de fixtures/llm, sans appel à OpenAI.
import assert from "node:assert/strict";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { makePdf } from "./tests/helpers/pdf.js";
import { passportSample, rccmSample } from "./tests/helpers/samples.js";

process.loadEnvFile(".env");
process.env.MONGO_URL = "mongodb://localhost:27017/kyb_smoke";
process.env.S3_BUCKET = "kyb-smoke";
process.env.PORT = "4123";
process.env.LLM_MODE = "replay";

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

  const pdf = rccmSample.pdf;
  const first = await upload(id, token, [
    { name: "rccm.pdf", content: pdf, type: "application/pdf" },
    { name: "passeport.pdf", content: passportSample.pdf, type: "application/pdf" },
  ]);
  assert.equal(first.status, 202);
  const { documents } = await first.json();
  assert.equal(documents.length, 2);
  assert.deepEqual(
    documents.map((d: { page_count: number; status: string }) => [d.page_count, d.status]),
    [
      [1, "uploaded"],
      [1, "uploaded"],
    ],
  );
  step("upload RCCM + passeport (202, pages comptées)");

  // Traitement async : classification puis extraction (LLM rejoué), suivi par polling comme le front.
  const deadline = Date.now() + 20_000;
  let current: { documents: Array<{ status: string; type: string | null; bridge_sections: string[] }> } = {
    documents: [],
  };
  while (Date.now() < deadline) {
    current = await (await fetch(`${base}/${id}`, { headers: auth })).json();
    if (current.documents.every((d) => ["extracted", "failed", "needs_type_confirmation"].includes(d.status))) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.deepEqual(
    current.documents.map((d) => [d.status, d.type, d.bridge_sections]),
    [
      ["extracted", "rccm", ["formation"]],
      ["extracted", "id_document", ["ubo"]],
    ],
  );
  step("traitement async : uploaded → classifying → extracting → extracted (types et sections Bridge)");

  const record = await getDb().collection("documents").findOne({ _id: documents[0].id });
  assert.ok(record);
  assert.equal(record.extracted_data, undefined);
  assert.equal(typeof record.extracted_data_enc, "string");
  const encBytes = Buffer.from(record.extracted_data_enc, "base64");
  assert.equal(encBytes.includes(Buffer.from("BARRY")), false);
  assert.equal(encBytes.includes(Buffer.from("rccm_number")), false);
  step("champs extraits chiffrés en base (aucune valeur en clair)");

  const detail = await (await fetch(`${base}/${id}/documents/${documents[0].id}`, { headers: auth })).json();
  assert.equal(detail.extracted_data.rccm_number.value, "NE-NIM-01-2019-B12-00987");
  assert.equal(detail.extracted_data.legal_form_explicit.value, null);
  step("GET document : champs extraits déchiffrés");
  assert.deepEqual(
    record.llm_usage.map((u: { purpose: string; replayed: boolean }) => [u.purpose, u.replayed]),
    [
      ["classify", true],
      ["extract", true],
    ],
  );
  step("consommation LLM enregistrée");

  type FieldView = { value: unknown; edited_by_user: boolean; conflict: boolean; source_doc_id: string | null };
  type View = {
    business: Record<string, FieldView>;
    ubos: Array<{ full_name: FieldView; is_control_person: boolean; id_document_id: string | null }>;
    alerts: unknown[];
    processing_documents: number;
  };
  const view: View = await (await fetch(`${base}/${id}`, { headers: auth })).json();
  assert.equal(view.processing_documents, 0);
  assert.equal(view.business.legal_name!.value, "BARRY AUTO SARL");
  assert.equal(view.business.legal_name!.source_doc_id, documents[0].id);
  assert.equal(view.business.registration_number!.value, "NE-NIM-01-2019-B12-00987");
  assert.equal(view.business.country!.value, "NER");
  // Cas SAIDOU AUTO : pas de mention « Forme juridique » → forme Bridge vide, demandée au client.
  assert.equal(view.business.entity_type!.value, null);
  assert.equal(view.business.dao!.value, false);
  assert.deepEqual(
    view.ubos.map((u) => [u.full_name.value, u.is_control_person, u.id_document_id !== null]),
    [
      ["Ibrahim Moussa BARRY", true, false],
      ["FATOU AMINATA SPECIMEN", false, true],
    ],
  );
  step("GET dossier : champs fusionnés, forme juridique non déduite du sigle, UBO rapprochés");

  const patchApp = (body: unknown) =>
    fetch(`${base}/${id}`, {
      method: "PATCH",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  const saved = await patchApp({
    business: { email: "contact@barry.example", phone: "90 00 00 00", legal_name: "BARRY AUTO", website: null },
  });
  assert.equal(saved.status, 200);
  const savedView: View = await saved.json();
  assert.equal(savedView.business.phone!.value, "+22790000000");
  assert.deepEqual(
    [savedView.business.legal_name!.value, savedView.business.legal_name!.edited_by_user],
    ["BARRY AUTO", true],
  );
  assert.deepEqual([savedView.business.website!.value, savedView.business.website!.edited_by_user], [null, true]);
  const reread: View = await (await fetch(`${base}/${id}`, { headers: auth })).json();
  assert.equal(reread.business.email!.value, "contact@barry.example");
  assert.equal(reread.business.legal_name!.value, "BARRY AUTO");
  step("PATCH dossier (autosave) : saisies enregistrées, téléphone en E.164, extraction non prioritaire");

  const invalidPatch = await patchApp({ business: { email: "pas-un-email", annual_revenue: "beaucoup" } });
  assert.equal(invalidPatch.status, 400);
  const invalidBody = await invalidPatch.json();
  assert.deepEqual(
    invalidBody.error.details.fields.map((f: { field: string }) => f.field),
    ["business.email", "business.annual_revenue"],
  );
  assert.equal(JSON.stringify(invalidBody).includes("pas-un-email"), false);
  const invalidPhone = await patchApp({ business: { phone: "123" } });
  assert.equal(invalidPhone.status, 400);
  step("PATCH dossier invalide refusé (400, sans renvoyer les valeurs saisies)");

  type UboJson = {
    id: string;
    full_name: FieldView;
    address: FieldView;
    id_expiry: FieldView;
    attests_ownership: boolean;
    added_by_user: boolean;
    id_document_id: string | null;
  };
  const uboCall = (method: string, path: string, body?: unknown) =>
    fetch(`${base}/${id}/ubos${path}`, {
      method,
      headers: { ...auth, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const ubosOf = (v: { ubos: UboJson[] }) => v.ubos;

  const detected = ubosOf(reread as unknown as { ubos: UboJson[] });
  const barryId = detected.find((u) => u.full_name.value === "Ibrahim Moussa BARRY")!.id;
  const specimenId = detected.find((u) => u.full_name.value === "FATOU AMINATA SPECIMEN")!.id;

  const added = await uboCall("POST", "", { full_name: "Mariama DIALLO", role: "Directrice générale", ownership_pct: 20 });
  assert.equal(added.status, 201);
  const addedBody = await added.json();
  const manualId: string = addedBody.ubo_id;
  assert.match(manualId, /^ubo_m_/);
  const manual = ubosOf(addedBody.application).find((u) => u.id === manualId)!;
  assert.deepEqual([manual.full_name.value, manual.added_by_user], ["Mariama DIALLO", true]);
  assert.equal((await uboCall("POST", "", { role: "DG" })).status, 400);
  step("POST ubos : personne ajoutée à la main (201), nom obligatoire (400)");

  const attest = await uboCall("PATCH", `/${barryId}`, { address: "Quartier Plateau, Niamey", attests_ownership: true });
  assert.equal(attest.status, 200);
  const barry = ubosOf(await attest.json()).find((u) => u.id === barryId)!;
  assert.deepEqual([barry.address.value, barry.address.edited_by_user, barry.attests_ownership], [
    "Quartier Plateau, Niamey",
    true,
    true,
  ]);
  const notControl = await uboCall("PATCH", `/${specimenId}`, { attests_ownership: true });
  assert.equal(notControl.status, 400);
  assert.equal((await notControl.json()).error.details.fields[0].field, "attests_ownership");
  step("PATCH ubo : correction et signataire de l'attestation (personne de direction uniquement)");

  const linked = await uboCall("PATCH", `/${manualId}`, { id_document_id: documents[1].id });
  assert.equal(linked.status, 200);
  const linkedUbo = ubosOf(await linked.json()).find((u) => u.id === manualId)!;
  assert.deepEqual([linkedUbo.id_document_id, linkedUbo.id_expiry.value], [documents[1].id, "2032-02-14"]);
  const wrongDoc = await uboCall("PATCH", `/${manualId}`, { id_document_id: documents[0].id });
  assert.equal(wrongDoc.status, 400);
  step("PATCH ubo : pièce d'identité rattachée (expiration lue sur l'extraction), autre type refusé");

  const hidden = await uboCall("DELETE", `/${specimenId}`);
  assert.equal(hidden.status, 200);
  const deleted = await uboCall("DELETE", `/${manualId}`);
  const remaining = ubosOf(await deleted.json()).map((u) => u.id);
  assert.deepEqual(remaining, [barryId]);
  assert.equal((await uboCall("PATCH", `/${specimenId}`, { role: "Gérant" })).status, 404);
  step("DELETE ubo : personne détectée masquée, personne ajoutée supprimée, 404 ensuite");

  const docs = getDb().collection("documents");
  const passportId = documents[1].id;
  const patchType = (docId: string, body: unknown) =>
    fetch(`${base}/${id}/documents/${docId}`, {
      method: "PATCH",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  for (const body of [{ type: "unknown" }, { type: "facture" }, {}]) {
    const invalid = await patchType(passportId, body);
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error.code, "VALIDATION_ERROR");
  }
  step("PATCH type invalide ou `unknown` refusé (400)");

  await docs.updateOne({ _id: passportId }, { $set: { status: "extracting" } });
  const busy = await patchType(passportId, { type: "id_document" });
  assert.equal(busy.status, 409);
  assert.equal((await busy.json()).error.code, "DOCUMENT_PROCESSING");
  await docs.updateOne({ _id: passportId }, { $set: { status: "extracted" } });
  step("PATCH pendant le traitement refusé (409 DOCUMENT_PROCESSING)");

  const confirmed = await patchType(passportId, { type: "id_document" });
  assert.equal(confirmed.status, 202);
  const confirmedDoc = await confirmed.json();
  assert.deepEqual(
    [confirmedDoc.status, confirmedDoc.type, confirmedDoc.type_confirmed_by_user, confirmedDoc.type_confidence],
    ["extracting", "id_document", true, 1],
  );
  let reextracted = confirmedDoc;
  for (let i = 0; i < 100 && reextracted.status === "extracting"; i++) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    reextracted = await (await fetch(`${base}/${id}/documents/${passportId}`, { headers: auth })).json();
  }
  assert.equal(reextracted.status, "extracted");
  assert.equal(reextracted.extracted_data.last_name.value, "SPECIMEN");
  assert.deepEqual(reextracted.bridge_sections, ["ubo"]);
  const passportRecord = await docs.findOne({ _id: passportId });
  assert.deepEqual(
    passportRecord!.llm_usage.map((u: { purpose: string }) => u.purpose),
    ["classify", "extract", "extract"],
  );
  step("PATCH type confirmé (202) → réextraction sans reclassification → extracted");

  await getDb().collection("applications").updateOne({ _id: id }, { $set: { status: "submitted" } });
  const lockedPatch = await patchType(passportId, { type: "id_document" });
  const lockedUpload = await upload(id, token, [{ name: "x.pdf", content: makePdf(1), type: "application/pdf" }]);
  const lockedDelete = await fetch(`${base}/${id}/documents/${passportId}`, { method: "DELETE", headers: auth });
  const lockedAutosave = await patchApp({ business: { email: "autre@barry.example" } });
  const lockedUbo = await uboCall("POST", "", { full_name: "Nouvelle Personne" });
  for (const response of [lockedPatch, lockedUpload, lockedDelete, lockedAutosave, lockedUbo]) {
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error.code, "APPLICATION_LOCKED");
  }
  await getDb().collection("applications").updateOne({ _id: id }, { $set: { status: "draft" } });
  step("dossier soumis en lecture seule (409 APPLICATION_LOCKED)");
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

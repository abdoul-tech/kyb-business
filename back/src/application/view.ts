import { createHmac } from "node:crypto";
import type { ApplicationView } from "@kyb/shared";
import { encryptionKey } from "../config/env.js";
import { toPublicApplication, type ApplicationDocument } from "../db/applications.js";
import { readExtractedData } from "../db/document-patch.js";
import { findDocumentsByApplication, toPublicDocument } from "../db/documents.js";
import { PENDING_STATUSES } from "../documents/pipeline.js";
import { mergeApplication, type MergeDocument } from "./merge.js";
import { EMPTY_USER_UBOS } from "./user-ubos.js";

// Sel des identifiants de personnes : secret serveur propre au dossier, stable d'une lecture à l'autre.
function uboIdSalt(applicationId: string): string {
  return createHmac("sha256", encryptionKey).update(`ubo-id:${applicationId}`).digest("hex");
}

// Dossier complet (GET /applications/{id}) : fusion recalculée depuis les documents extraits et les saisies du client.
export async function buildApplicationView(application: ApplicationDocument): Promise<ApplicationView> {
  const documents = await findDocumentsByApplication(application._id);

  const extracted: MergeDocument[] = documents
    .filter((doc) => doc.status === "extracted" && doc.type && doc.extracted_data_enc)
    .map((doc) => ({
      id: doc._id,
      type: doc.type!,
      uploaded_at: doc.uploaded_at,
      data: readExtractedData(doc, encryptionKey),
    }));

  const merged = mergeApplication(
    extracted,
    application.user_business ?? {},
    { ...EMPTY_USER_UBOS, ...application.user_ubos },
    uboIdSalt(application._id),
  );

  return {
    ...toPublicApplication(application),
    business: merged.business,
    ubos: merged.ubos,
    alerts: merged.alerts,
    documents: documents.map(toPublicDocument),
    processing_documents: documents.filter((doc) => PENDING_STATUSES.includes(doc.status)).length,
  };
}

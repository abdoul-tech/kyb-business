import { env } from "../config/env.js";
import {
  createStoredDocument,
  findDocumentBySha256,
  isDuplicateKeyError,
  newDocumentId,
  type StoredDocumentRecord,
} from "../db/documents.js";
import { checkFile, type CheckedFile } from "./file-check.js";
import { deleteObject, putEncryptedObject, storageKeyFor } from "./storage.js";

export type IncomingFile = {
  originalname: string;
  buffer: Buffer;
};

async function storeOne(
  applicationId: string,
  file: IncomingFile,
  checked: CheckedFile,
): Promise<StoredDocumentRecord> {
  const existing = await findDocumentBySha256(applicationId, checked.sha256);
  if (existing) {
    return existing;
  }

  const id = newDocumentId();
  const storageKey = storageKeyFor(applicationId, id);

  // Fichier d'abord, enregistrement ensuite : un document en base pointe toujours vers un objet existant.
  await putEncryptedObject(storageKey, file.buffer);

  try {
    return await createStoredDocument({
      id,
      applicationId,
      originalFilename: file.originalname,
      mimeType: checked.mimeType,
      sizeBytes: file.buffer.length,
      storageKey,
      sha256: checked.sha256,
      pageCount: checked.pageCount,
    });
  } catch (error) {
    await deleteObject(storageKey).catch(() => undefined);

    // Même fichier envoyé en parallèle : l'autre requête a gagné, on renvoie son document.
    if (isDuplicateKeyError(error)) {
      const winner = await findDocumentBySha256(applicationId, checked.sha256);
      if (winner) {
        return winner;
      }
    }
    throw error;
  }
}

// Tous les fichiers sont contrôlés avant d'en stocker un seul : un envoi est accepté ou refusé en bloc.
export async function ingestFiles(applicationId: string, files: IncomingFile[]): Promise<StoredDocumentRecord[]> {
  const limits = { maxBytes: env.MAX_FILE_BYTES, maxPages: env.MAX_PAGES };
  const checked: CheckedFile[] = [];
  for (const file of files) {
    checked.push(await checkFile(file.buffer, file.originalname, limits));
  }

  const results: StoredDocumentRecord[] = [];
  const seen = new Set<string>();
  for (const [index, file] of files.entries()) {
    const check = checked[index]!;
    const document = await storeOne(applicationId, file, check);
    if (!seen.has(document._id)) {
      seen.add(document._id);
      results.push(document);
    }
  }
  return results;
}

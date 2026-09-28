import { createHash } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { ApiError } from "../http/errors.js";

export const ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export type CheckedFile = {
  mimeType: AllowedMimeType;
  pageCount: number;
  sha256: string;
};

export type FileLimits = {
  maxBytes: number;
  maxPages: number;
};

function isAllowed(mime: string): mime is AllowedMimeType {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mime);
}

async function countPdfPages(content: Buffer, filename: string): Promise<number> {
  const task = getDocument({
    data: new Uint8Array(content),
    disableFontFace: true,
    verbosity: 0,
  });

  try {
    const pdf = await task.promise;
    return pdf.numPages;
  } catch (error) {
    const name = (error as { name?: string }).name;
    const message =
      name === "PasswordException"
        ? "Le PDF est protégé par un mot de passe. Merci de charger une version sans mot de passe."
        : "Le PDF est illisible ou corrompu.";
    throw new ApiError("VALIDATION_ERROR", message, { filename });
  } finally {
    await task.destroy();
  }
}

// Contrôle d'un fichier uploadé : type réel lu sur les octets (pas l'extension), taille, nombre de pages.
export async function checkFile(content: Buffer, filename: string, limits: FileLimits): Promise<CheckedFile> {
  if (content.length > limits.maxBytes) {
    throw new ApiError("FILE_TOO_LARGE", `Le fichier dépasse ${Math.round(limits.maxBytes / 1024 / 1024)} Mo.`, {
      filename,
      max_bytes: limits.maxBytes,
    });
  }

  const detected = await fileTypeFromBuffer(content);
  if (!detected || !isAllowed(detected.mime)) {
    throw new ApiError("UNSUPPORTED_FILE_TYPE", "Seuls les fichiers PDF, JPG et PNG sont acceptés.", {
      filename,
      allowed: ALLOWED_MIME_TYPES,
    });
  }

  const pageCount = detected.mime === "application/pdf" ? await countPdfPages(content, filename) : 1;
  if (pageCount > limits.maxPages) {
    throw new ApiError("TOO_MANY_PAGES", `Le document dépasse ${limits.maxPages} pages.`, {
      filename,
      max_pages: limits.maxPages,
      page_count: pageCount,
    });
  }

  return {
    mimeType: detected.mime,
    pageCount,
    sha256: createHash("sha256").update(content).digest("hex"),
  };
}

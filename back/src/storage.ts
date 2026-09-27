import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { StorageEngine } from "multer";
import multer from "multer";

const maxFileSize = 20 * 1024 * 1024;
const uploadDirectory = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "storage", "uploads");

mkdirSync(uploadDirectory, { recursive: true });

const allowedMimeTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);
const allowedExtensions = new Set([".pdf", ".jpg", ".jpeg", ".png"]);

function extensionFor(file: Express.Multer.File) {
  return path.extname(file.originalname).toLowerCase();
}

export const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDirectory,
    filename: (_request, file, callback) => {
      callback(null, `${randomUUID()}${extensionFor(file)}`);
    },
  }),
  limits: {
    fileSize: maxFileSize,
    files: 10,
  },
  fileFilter: (_request, file, callback) => {
    const validMimeType = allowedMimeTypes.has(file.mimetype);
    const validExtension = allowedExtensions.has(extensionFor(file));
    callback(null, validMimeType && validExtension);
  },
});

export const uploadConfig = {
  maxFileSize,
  maxFiles: 10,
  uploadDirectory,
};

export type FileStorage = StorageEngine;

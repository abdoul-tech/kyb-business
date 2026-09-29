import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { env } from "../../config/env.js";
import { logger } from "../../logger.js";
import { ApiError } from "../errors.js";
import { MAX_FILES_PER_UPLOAD } from "../upload.js";

function fromMulterError(error: multer.MulterError): ApiError {
  switch (error.code) {
    case "LIMIT_FILE_SIZE":
      return new ApiError("FILE_TOO_LARGE", `Le fichier dépasse ${Math.round(env.MAX_FILE_BYTES / 1024 / 1024)} Mo.`, {
        max_bytes: env.MAX_FILE_BYTES,
      });
    case "LIMIT_FILE_COUNT":
      return new ApiError("VALIDATION_ERROR", `${MAX_FILES_PER_UPLOAD} fichiers maximum par envoi.`, {
        max_files: MAX_FILES_PER_UPLOAD,
      });
    case "LIMIT_UNEXPECTED_FILE":
      return new ApiError("VALIDATION_ERROR", "Les fichiers doivent être envoyés dans le champ « file ».");
    default:
      return new ApiError("VALIDATION_ERROR", "Le fichier ne respecte pas les limites d'upload.");
  }
}

export function errorHandler(error: unknown, req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  const apiError = error instanceof multer.MulterError ? fromMulterError(error) : error;

  if (apiError instanceof ApiError) {
    res
      .status(apiError.status)
      .json({ error: { code: apiError.code, message: apiError.message, details: apiError.details } });
    return;
  }

  // serializeError retire le message de l'erreur, qui peut contenir une donnée du dossier.
  logger.error({ event: "http.unhandled_error", path: req.originalUrl.split("?")[0], err: error }, "http.unhandled_error");
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Erreur interne." } });
}

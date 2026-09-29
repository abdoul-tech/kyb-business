import type { NextFunction, Request, Response } from "express";
import type { Logger } from "pino";

// Une ligne par requête : méthode, chemin (identifiants seulement), statut, durée.
// Jamais d'en-têtes (jeton d'accès), de corps (valeurs saisies) ni de nom de fichier.
export function requestLog(logger: Logger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startedAt = process.hrtime.bigint();
    res.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const entry = {
        event: "http.request",
        method: req.method,
        path: req.originalUrl.split("?")[0],
        status: res.statusCode,
        duration_ms: Math.round(durationMs),
      };
      if (res.statusCode >= 500) {
        logger.error(entry, "http.request");
      } else {
        logger.info(entry, "http.request");
      }
    });
    next();
  };
}

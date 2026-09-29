import type { NextFunction, Request, Response } from "express";
import { findApplicationById, hashToken, type ApplicationDocument } from "../../db/applications.js";
import { ApiError } from "../errors.js";
import { requireParam } from "../params.js";

declare module "express-serve-static-core" {
  interface Request {
    application?: ApplicationDocument;
  }
}

// Spec : un dossier `submitted` est en lecture seule. À placer après requireApplicationAccess.
export function requireEditableApplication(req: Request, _res: Response, next: NextFunction): void {
  if (req.application?.status === "submitted") {
    next(new ApiError("APPLICATION_LOCKED", "Le dossier a été soumis : il ne peut plus être modifié."));
    return;
  }
  next();
}

export async function requireApplicationAccess(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.header("authorization") ?? "";
    const [scheme, token] = header.split(" ");

    if (scheme !== "Bearer" || !token) {
      throw new ApiError("UNAUTHORIZED", "Jeton d'accès manquant ou invalide.");
    }

    const application = await findApplicationById(requireParam(req.params.id, "id"));

    if (!application || application.access_token_hash !== hashToken(token)) {
      throw new ApiError("UNAUTHORIZED", "Jeton d'accès manquant ou invalide.");
    }

    req.application = application;
    next();
  } catch (error) {
    next(error);
  }
}

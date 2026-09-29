import { ConfirmDocumentTypeRequestSchema, documentTypeSlugValues } from "@kyb/shared";
import { Router } from "express";
import { createApplication, toPublicApplication } from "../../db/applications.js";
import {
  confirmDocumentType,
  deleteDocument,
  findDocumentById,
  findDocumentsByApplication,
  toPublicDocument,
  toPublicDocumentDetail,
} from "../../db/documents.js";
import { ingestFiles } from "../../documents/ingest.js";
import { documentQueue } from "../../documents/processing.js";
import { deleteObject } from "../../documents/storage.js";
import { MAX_FILES_PER_UPLOAD, upload } from "../upload.js";
import { requireApplicationAccess, requireEditableApplication } from "../middleware/auth.js";
import { ApiError } from "../errors.js";
import { requireParam } from "../params.js";

export const applicationsRouter = Router();

applicationsRouter.post("/", async (_req, res, next) => {
  try {
    const { id, accessToken } = await createApplication();
    res.status(201).json({ application_id: id, access_token: accessToken });
  } catch (error) {
    next(error);
  }
});

applicationsRouter.get("/:id", requireApplicationAccess, async (req, res, next) => {
  try {
    const application = req.application!;
    const documents = await findDocumentsByApplication(application._id);

    res.json({
      ...toPublicApplication(application),
      documents: documents.map(toPublicDocument),
    });
  } catch (error) {
    next(error);
  }
});

applicationsRouter.post(
  "/:id/documents",
  requireApplicationAccess,
  requireEditableApplication,
  upload.array("file", MAX_FILES_PER_UPLOAD),
  async (req, res, next) => {
    try {
      const files = (req.files ?? []) as Express.Multer.File[];

      if (files.length === 0) {
        throw new ApiError("VALIDATION_ERROR", "Au moins un fichier est requis.");
      }

      const documents = await ingestFiles(req.application!._id, files);
      res.status(202).json({ documents: documents.map(toPublicDocument) });

      // Traitement en arrière-plan ; le client suit l'avancement par polling du statut.
      for (const document of documents) {
        if (document.status === "uploaded") {
          documentQueue.enqueue(document._id);
        }
      }
    } catch (error) {
      next(error);
    }
  },
);

applicationsRouter.get("/:id/documents/:docId", requireApplicationAccess, async (req, res, next) => {
  try {
    const document = await findDocumentById(req.application!._id, requireParam(req.params.docId, "docId"));

    if (!document) {
      throw new ApiError("NOT_FOUND", "Document introuvable.");
    }

    res.json(toPublicDocumentDetail(document));
  } catch (error) {
    next(error);
  }
});

applicationsRouter.patch(
  "/:id/documents/:docId",
  requireApplicationAccess,
  requireEditableApplication,
  async (req, res, next) => {
    try {
      const body = ConfirmDocumentTypeRequestSchema.safeParse(req.body);
      if (!body.success) {
        throw new ApiError("VALIDATION_ERROR", "Type de document invalide.", {
          allowed: documentTypeSlugValues.filter((slug) => slug !== "unknown"),
        });
      }

      const applicationId = req.application!._id;
      const documentId = requireParam(req.params.docId, "docId");
      if (!(await findDocumentById(applicationId, documentId))) {
        throw new ApiError("NOT_FOUND", "Document introuvable.");
      }

      const document = await confirmDocumentType(applicationId, documentId, body.data.type);
      if (!document) {
        throw new ApiError(
          "DOCUMENT_PROCESSING",
          "Le document est en cours d'analyse : réessayez dans quelques secondes.",
        );
      }

      documentQueue.enqueue(document._id);
      res.status(202).json(toPublicDocument(document));
    } catch (error) {
      next(error);
    }
  },
);

applicationsRouter.delete("/:id/documents/:docId", requireApplicationAccess, requireEditableApplication, async (req, res, next) => {
  try {
    const document = await deleteDocument(req.application!._id, requireParam(req.params.docId, "docId"));

    if (!document) {
      throw new ApiError("NOT_FOUND", "Document introuvable.");
    }

    await deleteObject(document.storage_key);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

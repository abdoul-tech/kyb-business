import {
  ApplicationPatchSchema,
  ConfirmDocumentTypeRequestSchema,
  documentTypeSlugValues,
  normalizePhone,
  type ApplicationPatch,
} from "@kyb/shared";
import { Router } from "express";
import { buildApplicationView } from "../../application/view.js";
import { createApplication, findApplicationById, saveUserBusinessValues } from "../../db/applications.js";
import {
  confirmDocumentType,
  deleteDocument,
  findDocumentById,
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
    res.json(await buildApplicationView(req.application!));
  } catch (error) {
    next(error);
  }
});

// Autosave (debounce 800 ms côté front) : valeurs brutes, enveloppées en champs `edited_by_user`.
applicationsRouter.patch("/:id", requireApplicationAccess, requireEditableApplication, async (req, res, next) => {
  try {
    const parsed = ApplicationPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      // Chemins et messages seulement : jamais les valeurs saisies.
      throw new ApiError("VALIDATION_ERROR", "Certains champs sont invalides.", {
        fields: parsed.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
      });
    }

    const application = req.application!;
    const values: NonNullable<ApplicationPatch["business"]> = { ...parsed.data.business };
    const revert = parsed.data.revert ?? [];
    const both = revert.filter((key) => key in values);
    if (both.length > 0) {
      throw new ApiError("VALIDATION_ERROR", "Certains champs sont invalides.", {
        fields: both.map((key) => ({ field: `revert`, message: `« ${key} » ne peut pas être saisi et rétabli à la fois.` })),
      });
    }

    // Spec : téléphone en E.164, pays de l'entreprise par défaut.
    if (typeof values.phone === "string") {
      const current = await buildApplicationView(application);
      const country = values.country ?? current.business.country.value;
      const phone = normalizePhone(values.phone, country);
      if (!phone) {
        throw new ApiError("VALIDATION_ERROR", "Certains champs sont invalides.", {
          fields: [{ field: "business.phone", message: "Numéro de téléphone invalide (format international attendu)." }],
        });
      }
      values.phone = phone;
    }

    if (Object.keys(values).length > 0 || revert.length > 0) {
      await saveUserBusinessValues(application._id, values, revert);
    }

    const updated = await findApplicationById(application._id);
    res.json(await buildApplicationView(updated!));
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

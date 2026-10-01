import { randomBytes } from "node:crypto";
import { CreateUboRequestSchema, UpdateUboRequestSchema, type UboView } from "@kyb/shared";
import { Router, type Request } from "express";
import type { z } from "zod";
import { buildApplicationView } from "../../application/view.js";
import { addManualUbo, findApplicationById, removeUbo, saveUboValues } from "../../db/applications.js";
import { findDocumentById } from "../../db/documents.js";
import { isControlRole } from "../../rules/ownership.js";
import { ApiError } from "../errors.js";
import { requireApplicationAccess, requireEditableApplication } from "../middleware/auth.js";
import { requireParam } from "../params.js";

// Routes /applications/{id}/ubos : les personnes détectées restent recalculées depuis les documents ;
// seules les actions du client sont stockées (voir application/user-ubos.ts).
export const ubosRouter = Router({ mergeParams: true });

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    // Chemins et messages seulement : jamais les valeurs saisies.
    throw new ApiError("VALIDATION_ERROR", "Certains champs sont invalides.", {
      fields: parsed.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
    });
  }
  return parsed.data;
}

async function freshView(req: Request) {
  const updated = await findApplicationById(req.application!._id);
  return buildApplicationView(updated!);
}

async function findUbo(req: Request): Promise<UboView> {
  const uboId = requireParam(req.params.uboId, "uboId");
  const view = await buildApplicationView(req.application!);
  const ubo = view.ubos.find((u) => u.id === uboId);
  if (!ubo) {
    throw new ApiError("NOT_FOUND", "Personne introuvable.");
  }
  return ubo;
}

ubosRouter.use(requireApplicationAccess, requireEditableApplication);

// Ajoute une personne absente des documents.
ubosRouter.post("/", async (req, res, next) => {
  try {
    const body = parseBody(CreateUboRequestSchema, req.body);
    const uboId = `ubo_m_${randomBytes(6).toString("hex")}`;
    await addManualUbo(req.application!._id, uboId, body);
    res.status(201).json({ ubo_id: uboId, application: await freshView(req) });
  } catch (error) {
    next(error);
  }
});

// Corrige une personne, rattache sa pièce d'identité, ou la désigne comme signataire de l'attestation.
ubosRouter.patch("/:uboId", async (req, res, next) => {
  try {
    const body = parseBody(UpdateUboRequestSchema, req.body);
    const ubo = await findUbo(req);
    const { attests_ownership, revert = [], ...values } = body;

    // Rétablir n'a de sens que pour une personne lue dans les documents, et pas pour un champ saisi en même temps.
    const conflicting = revert.filter((key) => key in values);
    if (revert.length > 0 && (ubo.added_by_user || conflicting.length > 0)) {
      throw new ApiError("VALIDATION_ERROR", "Certains champs sont invalides.", {
        fields: [
          {
            field: "revert",
            message: ubo.added_by_user
              ? "Cette personne a été ajoutée à la main : il n'y a pas de valeur de document à rétablir."
              : "Un champ ne peut pas être saisi et rétabli à la fois.",
          },
        ],
      });
    }

    if (values.id_document_id) {
      const document = await findDocumentById(req.application!._id, values.id_document_id);
      if (!document || document.type !== "id_document") {
        throw new ApiError("VALIDATION_ERROR", "Certains champs sont invalides.", {
          fields: [{ field: "id_document_id", message: "Ce document n'est pas une pièce d'identité de ce dossier." }],
        });
      }
    }

    let attesting: { attesting_ubo_id: string | null } | undefined;
    if (attests_ownership === true) {
      // Spec : l'attestation de propriété est signée par un control person.
      const role = values.role !== undefined ? values.role : ubo.role.value;
      const controlPerson = values.role !== undefined ? !!role && isControlRole(role) : ubo.is_control_person;
      if (!controlPerson) {
        throw new ApiError("VALIDATION_ERROR", "Certains champs sont invalides.", {
          fields: [
            {
              field: "attests_ownership",
              message: "Seule une personne de direction (gérant, PDG, DG, PCA…) peut signer l'attestation.",
            },
          ],
        });
      }
      attesting = { attesting_ubo_id: ubo.id };
    } else if (attests_ownership === false && ubo.attests_ownership) {
      attesting = { attesting_ubo_id: null };
    }

    await saveUboValues(req.application!._id, ubo.id, ubo.added_by_user, values, attesting, revert);
    res.json(await freshView(req));
  } catch (error) {
    next(error);
  }
});

// Retire une personne : supprimée si ajoutée à la main, masquée si détectée dans les documents.
ubosRouter.delete("/:uboId", async (req, res, next) => {
  try {
    const ubo = await findUbo(req);
    await removeUbo(req.application!._id, ubo.id, ubo.added_by_user, ubo.attests_ownership);
    res.json(await freshView(req));
  } catch (error) {
    next(error);
  }
});

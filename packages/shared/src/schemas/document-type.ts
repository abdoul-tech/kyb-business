import { z } from "zod";
import type { BridgeSection } from "./bridge-section.js";

export const documentTypeSlugValues = [
  "statuts",
  "rccm",
  "rccm_modificatif",
  "tax_certificate",
  "ownership_document",
  "id_document",
  "good_standing",
  "proof_of_address",
  "business_activity",
  "license",
  "logistics_document",
  "unknown",
] as const;

export const DocumentTypeSlugSchema = z.enum(documentTypeSlugValues);

export type DocumentTypeSlug = z.infer<typeof DocumentTypeSlugSchema>;

export type DocumentTypeInfo = {
  // Libellé montré au client (liste de choix quand le type est à confirmer).
  label_fr: string;
  // Sections Bridge alimentées. Une seule par document, sauf les statuts (Formation + Ownership).
  bridge_sections: BridgeSection[];
};

// Registre des types de document (spec : « Registre des types de document »).
export const documentTypeCatalog: Record<DocumentTypeSlug, DocumentTypeInfo> = {
  statuts: { label_fr: "Statuts", bridge_sections: ["formation", "ownership"] },
  rccm: { label_fr: "Extrait RCCM / registre du commerce", bridge_sections: ["formation"] },
  rccm_modificatif: { label_fr: "Certificat modificatif RCCM", bridge_sections: ["formation"] },
  tax_certificate: { label_fr: "Certificat fiscal (NIF, NINEA, IFU, TIN)", bridge_sections: ["formation"] },
  ownership_document: {
    label_fr: "Registre des associés, PV d'AG, cap table",
    bridge_sections: ["ownership"],
  },
  id_document: { label_fr: "Passeport ou CNI", bridge_sections: ["ubo"] },
  good_standing: {
    label_fr: "Quitus fiscal, attestation de non-faillite",
    bridge_sections: ["good_standing"],
  },
  proof_of_address: { label_fr: "Facture, relevé bancaire, bail", bridge_sections: ["proof_of_address"] },
  business_activity: { label_fr: "Facture ou contrat client", bridge_sections: ["business_activity"] },
  license: { label_fr: "Agrément, licence, autorisation", bridge_sections: ["licensure"] },
  logistics_document: {
    label_fr: "Bail d'entrepôt, connaissement, contrat logistique",
    bridge_sections: ["additional"],
  },
  unknown: { label_fr: "Autre", bridge_sections: [] },
};

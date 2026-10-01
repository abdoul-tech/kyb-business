import {
  documentTypeCatalog,
  type ApplicationView,
  type DocumentStatus,
  type DocumentTypeSlug,
  type StoredDocument,
} from "@kyb/shared";

export const documentStatusLabel: Record<DocumentStatus, string> = {
  uploaded: "En attente",
  classifying: "Identification…",
  extracting: "Lecture…",
  extracted: "Prêt",
  needs_type_confirmation: "Type à confirmer",
  failed: "Erreur",
};

export const documentStatusTone: Record<DocumentStatus, "success" | "warning" | "danger" | "neutral"> = {
  uploaded: "neutral",
  classifying: "neutral",
  extracting: "neutral",
  extracted: "success",
  needs_type_confirmation: "warning",
  failed: "danger",
};

// Avancement indicatif du traitement d'un document (l'API ne donne que l'étape).
export const documentStatusProgress: Partial<Record<DocumentStatus, number>> = {
  uploaded: 15,
  classifying: 40,
  extracting: 75,
};

// Messages client pour les codes d'erreur du traitement (`error_code`).
export function documentErrorMessage(code: string | null): string {
  switch (code) {
    case "EXTRACTION_INVALID":
      return "Document illisible : merci de charger un scan plus net.";
    case "EXTRACTION_NOT_SUPPORTED":
      return "Type reconnu, mais sa lecture automatique n'est pas encore disponible. Vous pouvez le laisser dans le dossier.";
    case "LLM_UNAVAILABLE":
      return "Le service d'analyse est momentanément indisponible. Confirmez le type pour relancer l'analyse.";
    default:
      return "L'analyse de ce document a échoué. Confirmez son type pour la relancer, ou chargez-le à nouveau.";
  }
}

export function documentTypeLabel(type: DocumentTypeSlug | null): string {
  return type ? documentTypeCatalog[type].label_fr : "Document à identifier";
}

// Types proposés au client quand le type est à confirmer.
export const selectableDocumentTypes = (Object.keys(documentTypeCatalog) as DocumentTypeSlug[]).filter(
  (type): type is Exclude<DocumentTypeSlug, "unknown"> => type !== "unknown",
);

// « Extrait RCCM / registre du commerce » pour un identifiant de document du dossier.
export function sourceLabel(view: ApplicationView, docId: string | null): string | null {
  if (!docId) {
    return null;
  }
  const doc = view.documents.find((d: StoredDocument) => d.id === docId);
  return doc ? documentTypeLabel(doc.type) : "Document retiré";
}

export function fileSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} Ko` : `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

export function displayValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "—";
  }
  if (typeof value === "object" && "full_address" in value) {
    return String((value as { full_address: string }).full_address);
  }
  if (typeof value === "object" && "amount" in value) {
    const capital = value as { amount: number; currency: string };
    return `${capital.amount.toLocaleString("fr-FR")} ${capital.currency}`;
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  }
  return String(value);
}

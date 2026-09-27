import type { AlertItem, ExtractedField, UploadedDocument } from "@/types/onboarding";

export const mockDocuments: UploadedDocument[] = [
  { id: "rccm", name: "Extrait_RCCM_SAIDOU.pdf", kind: "RCCM", size: "2,4 MB", status: "ready", progress: 100 },
  { id: "statuts", name: "Statuts_SAIDOU_AUTO.pdf", kind: "Statuts", size: "4,8 MB", status: "review", progress: 100 },
  { id: "passport", name: "Passeport_Abdoulaye_Diallo.jpg", kind: "Passeport", size: "1,2 MB", status: "processing", progress: 68 },
];

export const companyFields: ExtractedField[] = [
  { id: "legal-name", label: "Dénomination légale", value: "SAIDOU AUTO SARL", source: "Extrait RCCM", page: 1, confidence: 0.98 },
  { id: "entity-type", label: "Forme juridique", value: "SARL", source: "Statuts", page: 2, confidence: 0.94 },
  { id: "registration", label: "Numéro RCCM", value: "TG-LOM-2023-B-01842", source: "Extrait RCCM", page: 1, confidence: 0.97 },
  { id: "incorporation", label: "Date d’immatriculation", value: "14/06/2023", source: "Extrait RCCM", page: 1, confidence: 0.96 },
  { id: "address", label: "Adresse du siège", value: "Boulevard du 30 août, Lomé, Togo", source: "Extrait RCCM", page: 1, confidence: 0.73 },
  { id: "activity", label: "Activité principale", value: "Commerce de véhicules et pièces détachées", source: "Extrait RCCM", page: 2, confidence: 0.86 },
];

export const peopleFields: ExtractedField[] = [
  { id: "ubo-name", label: "Nom complet", value: "Abdoulaye Diallo", source: "Passeport", page: 1, confidence: 0.99 },
  { id: "ubo-birth", label: "Date de naissance", value: "12/04/1985", source: "Passeport", page: 1, confidence: 0.91 },
  { id: "ubo-nationality", label: "Nationalité", value: "Togolaise", source: "Passeport", page: 1, confidence: 0.89 },
  { id: "ubo-role", label: "Fonction", value: "Gérant", source: "Statuts", page: 4, confidence: 0.66 },
];

export const mockAlerts: AlertItem[] = [
  { id: "address", title: "Adresse à vérifier", detail: "La confiance est inférieure à 80 %. Vérifiez l’adresse du siège avec la source affichée.", severity: "warning" },
  { id: "ownership", title: "Répartition du capital incomplète", detail: "Ajoutez le pourcentage détenu par chaque associé avant la soumission.", severity: "blocking" },
  { id: "activity", title: "Preuve d’activité à prévoir", detail: "Une facture ou un contrat client sera demandé dans l’étape suivante.", severity: "info" },
];

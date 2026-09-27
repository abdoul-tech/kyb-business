export type StepKey = "documents" | "verify" | "complete" | "summary";

export type DocumentStatus = "ready" | "processing" | "review" | "error";

export type UploadedDocument = {
  id: string;
  name: string;
  kind: string;
  size: string;
  status: DocumentStatus;
  progress: number;
};

export type ExtractedField = {
  id: string;
  label: string;
  value: string;
  source: string;
  page: number;
  confidence: number;
};

export type AlertItem = {
  id: string;
  title: string;
  detail: string;
  severity: "warning" | "blocking" | "info";
};

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "APPLICATION_LOCKED"
  | "NOT_READY"
  | "DOCUMENT_PROCESSING"
  | "UNSUPPORTED_FILE_TYPE"
  | "FILE_TOO_LARGE"
  | "TOO_MANY_PAGES"
  | "RATE_LIMITED"
  | "LLM_UNAVAILABLE";

const statusByCode: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  APPLICATION_LOCKED: 409,
  NOT_READY: 409,
  // Ajout à la liste de la spec : le document est en cours de classification ou d'extraction.
  DOCUMENT_PROCESSING: 409,
  UNSUPPORTED_FILE_TYPE: 415,
  FILE_TOO_LARGE: 413,
  TOO_MANY_PAGES: 413,
  RATE_LIMITED: 429,
  LLM_UNAVAILABLE: 503,
};

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.details = details;
  }

  get status(): number {
    return statusByCode[this.code];
  }
}

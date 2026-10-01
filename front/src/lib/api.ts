import type {
  ApplicationPatch,
  ApplicationView,
  CreateUboRequest,
  DocumentTypeSlug,
  StoredDocument,
  StoredDocumentDetail,
  UpdateUboRequest,
} from "@kyb/shared";

// Le navigateur ne parle qu'aux Route Handlers de /api, qui ajoutent le jeton (cookie httpOnly).
const BASE = "/api/applications";

export type FieldError = { field: string; message: string };

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: FieldError[];

  constructor(status: number, code: string, message: string, fields: FieldError[] = []) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

type ErrorBody = { error?: { code?: string; message?: string; details?: { fields?: FieldError[] } } };

function toError(status: number, body: ErrorBody | null): ApiRequestError {
  const error = body?.error;
  return new ApiRequestError(
    status,
    error?.code ?? "UNKNOWN",
    error?.message ?? "Une erreur est survenue. Réessayez dans un instant.",
    error?.details?.fields ?? [],
  );
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: init.body ? { "content-type": "application/json", ...init.headers } : init.headers,
    cache: "no-store",
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    throw toError(response.status, body as ErrorBody | null);
  }
  return body as T;
}

// Upload d'un fichier par requête, via XHR pour suivre la progression réseau.
function uploadDocument(
  applicationId: string,
  file: File,
  onProgress: (ratio: number) => void,
): Promise<{ documents: StoredDocument[] }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE}/${applicationId}/documents`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(event.loaded / event.total);
      }
    };
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // Corps non JSON : erreur générique ci-dessous.
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as { documents: StoredDocument[] });
      } else {
        reject(toError(xhr.status, body as ErrorBody | null));
      }
    };
    xhr.onerror = () => reject(new ApiRequestError(0, "NETWORK", "Connexion interrompue pendant l'envoi."));
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}

export const api = {
  createApplication: () => request<{ application_id: string }>("", { method: "POST" }),
  getApplication: (id: string) => request<ApplicationView>(`/${id}`),
  patchApplication: (id: string, patch: ApplicationPatch) =>
    request<ApplicationView>(`/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  uploadDocument,
  getDocument: (id: string, docId: string) => request<StoredDocumentDetail>(`/${id}/documents/${docId}`),
  confirmDocumentType: (id: string, docId: string, type: Exclude<DocumentTypeSlug, "unknown">) =>
    request<StoredDocument>(`/${id}/documents/${docId}`, { method: "PATCH", body: JSON.stringify({ type }) }),
  deleteDocument: (id: string, docId: string) => request<null>(`/${id}/documents/${docId}`, { method: "DELETE" }),
  addUbo: (id: string, body: CreateUboRequest) =>
    request<{ ubo_id: string; application: ApplicationView }>(`/${id}/ubos`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateUbo: (id: string, uboId: string, body: UpdateUboRequest) =>
    request<ApplicationView>(`/${id}/ubos/${uboId}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteUbo: (id: string, uboId: string) => request<ApplicationView>(`/${id}/ubos/${uboId}`, { method: "DELETE" }),
};

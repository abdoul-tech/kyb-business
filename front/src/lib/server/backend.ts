import "server-only";

// URL de l'API, côté serveur uniquement : le navigateur passe toujours par les Route Handlers de /api.
export const API_URL = process.env.API_URL ?? "http://localhost:4000";

// Spec : jeton de dossier gardé en cookie httpOnly (jamais lisible par le JavaScript de la page), 30 jours.
export const TOKEN_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const APPLICATION_ID = /^app_[0-9a-f-]{36}$/;

export function isApplicationId(value: string): boolean {
  return APPLICATION_ID.test(value);
}

export function tokenCookieName(applicationId: string): string {
  return `kyb_${applicationId}`;
}

export function apiError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

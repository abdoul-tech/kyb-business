import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { API_URL, apiError, isApplicationId, tokenCookieName } from "@/lib/server/backend";

type Context = { params: Promise<{ id: string; path?: string[] }> };

const SEGMENT = /^[A-Za-z0-9_-]+$/;

// Relais vers /v1/applications/{id}/… : ajoute le jeton du cookie httpOnly en en-tête Authorization.
// Le corps (JSON ou multipart d'upload) est transmis en flux, sans être relu ni journalisé.
async function relay(request: NextRequest, context: Context): Promise<Response> {
  const { id, path = [] } = await context.params;
  if (!isApplicationId(id) || !path.every((segment) => SEGMENT.test(segment))) {
    return apiError(404, "NOT_FOUND", "Ressource introuvable.");
  }

  const token = (await cookies()).get(tokenCookieName(id))?.value;
  if (!token) {
    return apiError(401, "UNAUTHORIZED", "Session expirée : ce dossier n'est pas accessible depuis ce navigateur.");
  }

  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  const contentType = request.headers.get("content-type");
  if (contentType) {
    headers["content-type"] = contentType;
  }
  const hasBody = !["GET", "HEAD"].includes(request.method);

  let response: Response;
  try {
    response = await fetch(`${API_URL}/v1/applications/${[id, ...path].join("/")}`, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      // Requis par fetch (Node) pour envoyer un corps en flux.
      ...(hasBody ? { duplex: "half" } : {}),
      cache: "no-store",
    } as RequestInit);
  } catch {
    return apiError(503, "API_UNAVAILABLE", "Le service est momentanément indisponible.");
  }

  return new Response(response.status === 204 ? null : response.body, {
    status: response.status,
    headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
  });
}

export const GET = relay;
export const POST = relay;
export const PATCH = relay;
export const DELETE = relay;

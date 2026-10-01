import { cookies } from "next/headers";
import { API_URL, apiError, isApplicationId, TOKEN_MAX_AGE_SECONDS, tokenCookieName } from "@/lib/server/backend";

// Crée un dossier : le jeton renvoyé par l'API est posé en cookie httpOnly, seul l'identifiant part au navigateur.
export async function POST() {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/v1/applications`, { method: "POST" });
  } catch {
    return apiError(503, "API_UNAVAILABLE", "Le service est momentanément indisponible.");
  }
  if (!response.ok) {
    return new Response(response.body, { status: response.status, headers: { "content-type": "application/json" } });
  }

  const { application_id, access_token } = (await response.json()) as { application_id: string; access_token: string };
  if (!isApplicationId(application_id)) {
    return apiError(502, "BAD_GATEWAY", "Réponse inattendue du service.");
  }

  const cookieStore = await cookies();
  cookieStore.set(tokenCookieName(application_id), access_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TOKEN_MAX_AGE_SECONDS,
  });

  return Response.json({ application_id }, { status: 201 });
}

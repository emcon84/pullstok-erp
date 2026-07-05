// Proxy server-to-server hacia POST /api/store/chat/escalate — mismo motivo que
// message.ts/start.ts (la API pública NO tiene CORS para el origin de la
// tienda). Marca la conversación para atención humana (handoff): el bot deja de
// responder y el visitante recibe por socket el mensaje puente.
//   - X-Tenant-Slug: resuelto del Host header.
//   - Authorization: Bearer <guestToken>: el guest JWT que devolvió /start. La
//     conversación sale del token (NO se manda body).
//
// El token llega desde el browser via header Authorization o, como fallback,
// en el body ({ token }). El escalate a la API va SIN body.
import type { APIRoute } from "astro";
import { resolveSlugFromHost } from "@/lib/storeApi";

const API_BASE_URL = import.meta.env.PULLSTOK_API_URL ?? "http://localhost:5000";

export const POST: APIRoute = async ({ request }) => {
  const slug = resolveSlugFromHost(request.headers.get("host"));

  // El token puede venir por header (preferido) o, como fallback, en el body.
  let bodyToken: string | undefined;
  try {
    const payload = (await request.json()) as { token?: string };
    bodyToken = payload?.token;
  } catch {
    /* sin body: el token viene por header Authorization */
  }

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "") ?? bodyToken;

  if (!token) {
    return new Response(
      JSON.stringify({ message: "Sesión de chat no válida." }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const apiRes = await fetch(`${API_BASE_URL}/api/store/chat/escalate`, {
      method: "POST",
      headers: {
        "X-Tenant-Slug": slug,
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await apiRes.text();

    return new Response(data, {
      status: apiRes.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return new Response(
      JSON.stringify({ message: "No pudimos conectarte con una persona. Intentá de nuevo." }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }
};

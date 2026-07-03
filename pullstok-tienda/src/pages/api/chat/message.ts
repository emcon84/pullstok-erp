// Proxy server-to-server hacia POST /api/store/chat/message — mismo motivo que
// start.ts/checkout.ts (sin CORS para el origin de la tienda). Reenvía el
// mensaje del visitante con:
//   - X-Tenant-Slug: resuelto del Host header.
//   - Authorization: Bearer <guestToken>: el guest JWT que devolvió /start. La
//     conversación sale del token (el body NO manda conversationId).
//
// El token llega desde el browser via header Authorization o, como fallback,
// en el body ({ token, body }). Se reenvía SOLO el { body } a la API.
import type { APIRoute } from "astro";
import { resolveSlugFromHost } from "@/lib/storeApi";

const API_BASE_URL = import.meta.env.PULLSTOK_API_URL ?? "http://localhost:5000";

export const POST: APIRoute = async ({ request }) => {
  const slug = resolveSlugFromHost(request.headers.get("host"));

  let payload: { token?: string; body?: string };
  try {
    payload = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ message: "Cuerpo inválido." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "") ?? payload.token;

  if (!token) {
    return new Response(
      JSON.stringify({ message: "Sesión de chat no válida." }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const apiRes = await fetch(`${API_BASE_URL}/api/store/chat/message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-Slug": slug,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ body: payload.body }),
    });

    const data = await apiRes.text();

    return new Response(data, {
      status: apiRes.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return new Response(
      JSON.stringify({ message: "No pudimos enviar el mensaje. Intentá de nuevo." }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }
};

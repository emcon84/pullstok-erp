// Proxy server-to-server hacia POST /api/store/chat/start — mismo motivo que
// checkout.ts: la API pública NO tiene CORS habilitado para el origin de la
// tienda, así que el browser no le pega directo por HTTP. Este endpoint corre
// en el server de Astro (Node adapter) → fetch server-to-server sin CORS.
//
// El slug del tenant se resuelve del Host header (igual que el resto del
// storefront). El body { name, email } viaja tal cual; la API devuelve
// { token, conversationId, messages } (reusa la conversación OPEN del mismo
// email → puede venir con historial).
import type { APIRoute } from "astro";
import { resolveSlugFromHost } from "@/lib/storeApi";

const API_BASE_URL = import.meta.env.PULLSTOK_API_URL ?? "http://localhost:5000";

export const POST: APIRoute = async ({ request }) => {
  const slug = resolveSlugFromHost(request.headers.get("host"));
  const body = await request.text();

  try {
    const apiRes = await fetch(`${API_BASE_URL}/api/store/chat/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-Slug": slug,
      },
      body,
    });

    const data = await apiRes.text();

    return new Response(data, {
      status: apiRes.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return new Response(
      JSON.stringify({ message: "No pudimos iniciar el chat. Intentá de nuevo." }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }
};

// Proxy server-to-server hacia POST /api/store/checkout — el browser nunca
// le pega directo a la API (mismo motivo que storeApi.ts: la API pública NO
// tiene CORS habilitado para el origin de la tienda, solo para el front ERP
// — ver api/src/app.ts). Este endpoint corre en el server de Astro (Node
// adapter), así que es un fetch server-to-server normal, sin problema de
// CORS.
import type { APIRoute } from "astro";
import { resolveSlugFromHost } from "@/lib/storeApi";

const API_BASE_URL = import.meta.env.PULLSTOK_API_URL ?? "http://localhost:5000";

export const POST: APIRoute = async ({ request }) => {
  const slug = resolveSlugFromHost(request.headers.get("host"));
  const body = await request.text();

  const apiRes = await fetch(`${API_BASE_URL}/api/store/checkout`, {
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
};

// Cliente server-side hacia la API pública de la tienda (/api/store/...).
//
// El tenant se resuelve por Host header en producción (negocio.pullstok.com)
// y por fallback de config/env en desarrollo local, donde no hay DNS wildcard
// todavía (ver tenantBySlug.ts en api/ — mismo mecanismo de fallback en ese
// lado: X-Tenant-Slug header).
//
// IMPORTANTE: el fetch es SIEMPRE server-to-server (Astro SSR -> API en
// localhost), nunca desde el browser. Esto evita CORS por completo (decisión
// tomada en el design — fuera de alcance manejar CORS en la API pública).

const API_BASE_URL = import.meta.env.PULLSTOK_API_URL ?? "http://localhost:5000";
const LOCAL_FALLBACK_SLUG = import.meta.env.PULLSTOK_LOCAL_SLUG ?? "demo";

// Subdominios reservados que nunca son el slug de un negocio (debe espejar
// RESERVED_SLUGS de api/src/middlewares/tenantBySlug.ts).
const RESERVED_SLUGS = new Set(["pullstok", "www", "localhost"]);

/**
 * Extrae el slug del tenant a partir del Host header de la request entrante.
 * En local (sin wildcard DNS) el host es "localhost:3006" o similar, que cae
 * en RESERVED_SLUGS/sin-match -> usamos el fallback de config (`demo`).
 */
export function resolveSlugFromHost(host: string | null): string {
  const hostname = (host ?? "").split(":")[0];
  const label = hostname.split(".")[0];

  if (!label || RESERVED_SLUGS.has(label) || hostname === "127.0.0.1") {
    return LOCAL_FALLBACK_SLUG;
  }

  return label;
}

export interface StoreBadge {
  title: string;
  subtitle: string;
}

export interface StoreSettings {
  storeName: string;
  primaryColor: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  tagline: string | null;
  showNewsletter: boolean;
  showBanner: boolean;
  // Barra de confianza configurable (envío gratis, garantía, etc.) — null si
  // la org no configuró nada. El storefront oculta la barra en ese caso (NO
  // reviews/wishlist: no hay backend para eso, ver decisión del usuario).
  badges: StoreBadge[] | null;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
}

export interface StoreProduct {
  id: string;
  name: string;
  price: number;
  description: string | null;
  image: string | null;
  quantity: number;
}

class StoreNotAvailableError extends Error {}
class StoreNotFoundError extends Error {}

async function storeFetch(slug: string, path: string): Promise<Response> {
  const res = await fetch(`${API_BASE_URL}/api/store${path}`, {
    headers: { "X-Tenant-Slug": slug },
  });

  if (res.status === 403) {
    throw new StoreNotAvailableError(`Store not available for slug "${slug}"`);
  }
  if (res.status === 404) {
    throw new StoreNotFoundError(`Not found: ${path}`);
  }
  if (!res.ok) {
    throw new Error(`Store API error ${res.status} on ${path}`);
  }

  return res;
}

export async function getStoreSettings(slug: string): Promise<StoreSettings> {
  const res = await storeFetch(slug, "/settings");
  return res.json();
}

export async function getStoreProducts(slug: string, query?: string): Promise<StoreProduct[]> {
  const qs = query ? `?q=${encodeURIComponent(query)}` : "";
  const res = await storeFetch(slug, `/products${qs}`);
  return res.json();
}

export async function getStoreProductById(
  slug: string,
  id: string,
): Promise<StoreProduct | null> {
  try {
    const res = await storeFetch(slug, `/products/${id}`);
    return res.json();
  } catch (error) {
    if (error instanceof StoreNotFoundError) return null;
    throw error;
  }
}

export { StoreNotAvailableError, StoreNotFoundError };

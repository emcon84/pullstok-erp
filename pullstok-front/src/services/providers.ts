import { API_URL } from "../constants";

/**
 * Cliente API de proveedores (sdd/alican-wholesale-price-list/providers).
 * Mismo patrón que priceLists.ts: plain fetch + token de localStorage.
 */

export interface Provider {
  id: string;
  name: string;
}

/** GET /providers — proveedores de la org, por nombre asc. */
export const listProviders = async (): Promise<Provider[]> => {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_URL}/providers`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.items ?? [];
};

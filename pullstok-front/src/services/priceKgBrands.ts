import { API_URL } from "../constants";
import type { PriceKgSpecies } from "./priceKgTypes";

/**
 * Cliente API de marcas de precio por kilo (sdd/price-kg).
 * Mismo patrón que priceKgTypes.ts: plain fetch + token de localStorage.
 */

export interface PriceKgBrand {
  id: string;
  name: string;
  keywords: string[];
  species: PriceKgSpecies;
}

/** Parsea un CSV de palabras clave: trim, filtra vacíos y deduplica. */
export const parseKeywords = (csv: string): string[] => {
  const seen = new Set<string>();
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "" && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()));
};

/** GET /price-kg-brands — marcas de la org. */
export const listPriceKgBrands = async (): Promise<PriceKgBrand[]> => {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_URL}/price-kg-brands`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.items ?? [];
};

/** POST /price-kg-brands — crea una marca. */
export const createPriceKgBrand = async (payload: {
  name: string;
  keywords: string[];
  species: PriceKgSpecies;
}): Promise<PriceKgBrand> => {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_URL}/price-kg-brands`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || "No se pudo crear la marca de precio por kilo");
  }
  return data;
};

/** PUT /price-kg-brands/:id — actualiza una marca. */
export const updatePriceKgBrand = async (
  id: string,
  payload: { name?: string; keywords?: string[]; species?: PriceKgSpecies },
): Promise<PriceKgBrand> => {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_URL}/price-kg-brands/${id}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || "No se pudo actualizar la marca de precio por kilo");
  }
  return data;
};

/** DELETE /price-kg-brands/:id — elimina una marca. */
export const deletePriceKgBrand = async (id: string): Promise<void> => {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_URL}/price-kg-brands/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "No se pudo eliminar la marca de precio por kilo");
  }
};

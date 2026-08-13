import { API_URL } from "../constants";

/**
 * Cliente API de tipos de precio por kilo (sdd/price-kg).
 * Mismo patrón que providers.ts: plain fetch + token de localStorage.
 */

export interface PriceKgType {
  id: string;
  name: string;
  synonyms: string[];
}

/** Parsea un CSV de sinónimos: trim, filtra vacíos y deduplica. */
export const parseSynonyms = (csv: string): string[] => {
  const seen = new Set<string>();
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "" && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()));
};

/** GET /price-kg-types — tipos de la org. */
export const listPriceKgTypes = async (): Promise<PriceKgType[]> => {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_URL}/price-kg-types`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.items ?? [];
};

/** POST /price-kg-types — crea un tipo. */
export const createPriceKgType = async (payload: {
  name: string;
  synonyms: string[];
}): Promise<PriceKgType> => {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_URL}/price-kg-types`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || "No se pudo crear el tipo de precio por kilo");
  }
  return data;
};

/** PUT /price-kg-types/:id — actualiza un tipo. */
export const updatePriceKgType = async (
  id: string,
  payload: { name?: string; synonyms?: string[] },
): Promise<PriceKgType> => {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_URL}/price-kg-types/${id}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || "No se pudo actualizar el tipo de precio por kilo");
  }
  return data;
};

/** DELETE /price-kg-types/:id — elimina un tipo. */
export const deletePriceKgType = async (id: string): Promise<void> => {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_URL}/price-kg-types/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "No se pudo eliminar el tipo de precio por kilo");
  }
};

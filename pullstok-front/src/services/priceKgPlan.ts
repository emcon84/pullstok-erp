import { API_URL } from "../constants";
import type { PriceKgSpecies } from "./priceKgTypes";

/**
 * Cliente API de la planilla de precios por kilo (sdd/price-kg-plan).
 * Mismo patrón que priceKgTypes.ts / priceKgBrands.ts: plain fetch + token de
 * localStorage.
 */

export interface PriceKgPrice {
  id: string;
  brandId: string;
  typeId: string;
  species: PriceKgSpecies;
  priceKg: number;
  /** Código de balanza (scaleCode) asignado a la celda, si lo tiene. */
  scaleCode?: string | null;
}

/** Una celda de la planilla: priceKg null borra la celda; number la upserta. */
export interface PriceKgPlanEntry {
  brandId: string;
  typeId: string;
  species: PriceKgSpecies;
  priceKg: number | null;
}

/**
 * GET /price-kg-plan — celdas de la org (marca × tipo × especie → precio).
 * Devuelve celdas de TODAS las especies (la vista filtra por planilla activa).
 */
export const getPriceKgPlan = async (): Promise<PriceKgPrice[]> => {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_URL}/price-kg-plan`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.items ?? [];
};

/** PUT /price-kg-plan — guarda las celdas de la planilla activa (upsert + borrado). */
export const savePriceKgPlan = async (
  entries: PriceKgPlanEntry[],
): Promise<{ saved: number }> => {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_URL}/price-kg-plan`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ entries }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || "No se pudo guardar la planilla de precios por kilo");
  }
  return data;
};

/** Una celda con código de balanza (para el listado imprimible). */
export interface BalanzaCode {
  code: string;
  brand: string;
  type: string;
  species: PriceKgSpecies;
  priceKg: number;
}

/**
 * GET /price-kg-plan/codes — celdas que tienen código de balanza (scaleCode),
 * con marca/tipo/especie y precio/kg. Para el listado que imprimen los
 * vendedores.
 */
export const getBalanzaCodes = async (): Promise<BalanzaCode[]> => {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_URL}/price-kg-plan/codes`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.items ?? [];
};

/**
 * Descarga el CSV de códigos de balanza (formato Qendra / Systel Cuora) para
 * actualizar los precios de la balanza. Lo baja como archivo (blob) y devuelve
 * el nombre sugerido desde el header Content-Disposition. El navegador elige la
 * carpeta de descarga (habitualmente "Descargas"; si el usuario quiere
 * "Documentos", debe configurar "preguntar dónde guardar" en el navegador).
 */
export const downloadScaleCsv = async (): Promise<string> => {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_URL}/price-kg-plan/codes/csv`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "No se pudo generar el CSV");
  }
  const blob = await res.blob();
  const filename =
    res.headers
      .get("content-disposition")
      ?.match(/filename="?([^"]+)"?/)?.[1] || "scale-codes-qendra.csv";
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
  return filename;
};

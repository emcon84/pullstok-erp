import { API_URL } from "../constants";
import type { PriceKgSpecies } from "./priceKgTypes";

/**
 * Cliente API del stock de alimento suelto (sdd/loose-lines-stock).
 * Mismo patrón que priceKgReview.ts: plain fetch + token de localStorage. La
 * "línea" suelta ES la celda de la planilla por kilo (PriceKgPrice); el stock
 * en kg vive en LooseStock por (celda, sucursal).
 */

/** Una fila de LooseStock aplanada para el front (GET / y GET /:lineId). */
export interface LooseStockLine {
  id: string | null;
  priceKgPriceId: string;
  branchId: string;
  quantity: number;
  organizationId?: string | null;
  brandId?: string | null;
  brandName?: string | null;
  typeId?: string | null;
  typeName?: string | null;
  species?: PriceKgSpecies | null;
  priceKg?: number | null;
  lineName?: string | null;
  branchName?: string | null;
}

/** Resultado de POST /open-bag (celda resuelta + kg acreditados). */
export interface OpenBagResult {
  id: string | null;
  priceKgPriceId: string;
  branchId: string;
  quantity: number;
  organizationId?: string | null;
  brandId?: string | null;
  typeId?: string | null;
  species?: PriceKgSpecies | null;
  priceKg?: number | null;
}

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("token")}`,
  "Content-Type": "application/json",
});

/**
 * GET /loose-stock/:lineId?branchId= — stock suelto (kg) de una celda en una
 * sucursal. `lineId` es el id de la celda PriceKgPrice. La celda debe existir
 * (404 si no); la fila LooseStock puede no existir todavía → quantity 0.
 */
export const getLooseStock = async (
  lineId: string,
  branchId?: string,
): Promise<LooseStockLine> => {
  const qs = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
  const res = await fetch(`${API_URL}/loose-stock/${lineId}${qs}`, {
    headers: authHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || "No se pudo leer el stock suelto de la línea");
  }
  return data;
};

/**
 * PUT /loose-stock/:lineId — fija los kg de una celda en una sucursal
 * (ADMIN/MANAGEMENT). `lineId` es el id de la celda PriceKgPrice; si la fila
 * (celda, sucursal) no existe se crea.
 */
export const setLooseStock = async (
  lineId: string,
  payload: { branchId: string; quantity: number },
): Promise<{ lineId: string; branchId: string; quantity: number }> => {
  const res = await fetch(`${API_URL}/loose-stock/${lineId}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || "No se pudo actualizar el stock suelto");
  }
  return data;
};

/**
 * GET /loose-stock — listado plano del stock suelto de la org, opcionalmente
 * filtrado por sucursal. Devuelve { items }.
 */
export const listLooseStocks = async (
  branchId?: string,
): Promise<{ items: LooseStockLine[] }> => {
  const qs = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
  const res = await fetch(`${API_URL}/loose-stock${qs}`, {
    headers: authHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || "No se pudo listar el stock suelto");
  }
  return { items: Array.isArray(data.items) ? data.items : [] };
};

/**
 * POST /loose-stock/open-bag — abre una bolsa: −1 unidad en ProductStock de
 * bolsas, +weightKg en LooseStock de la celda destino (priceKgPriceId elegida
 * explícitamente, ya no hay auto-match por nombre). Errores de dominio
 * (LOOSE_*) → 422 { error, message }.
 */
export const openBag = async (payload: {
  productId: string;
  branchId?: string;
  priceKgPriceId: string;
}): Promise<OpenBagResult> => {
  const res = await fetch(`${API_URL}/loose-stock/open-bag`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || "No se pudo abrir la bolsa");
  }
  return data;
};
import { API_URL } from "../constants";
import type { PriceKgSpecies } from "./priceKgTypes";

/**
 * Cliente API de la cola de revisión de precios por kilo (sdd/precios-suelto-planilla).
 * Mismo patrón que priceKgPlan.ts: plain fetch + token de localStorage.
 */

export type ReviewQueueStatus = "PENDING" | "APPROVED" | "REJECTED";
export type ReviewQueueReason =
  | "FUZZY_MATCH"
  | "MANUAL_OVERRIDE"
  | "ORPHAN_CELL"
  | "BRAND_NO_PLANILLA";

export interface ReviewQueueEntry {
  id: string;
  productId: string | null;
  productName: string | null;
  priceKgPriceId: string | null;
  brandName: string | null;
  typeName: string | null;
  species: PriceKgSpecies;
  reason: ReviewQueueReason;
  status: ReviewQueueStatus;
  oldPriceKg: number | null;
  newPriceKg: number | null;
  reviewedBy: string | null;
  appliedAt: string | null;
  createdAt: string;
}

export interface ReviewQueuePage {
  items: ReviewQueueEntry[];
  total: number;
  page: number;
}

export interface AutoApplyResult {
  applied: number;
  queued: number;
  skipped: number;
}

/** Producto que matchea una celda de la planilla (panel de venta suelta). */
export interface CellProduct {
  id: string;
  name: string;
  weightKg: number | null;
  stock: number;
  priceKgSuelto: number | null;
  category: string;
  exact: boolean;
}

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("token")}`,
  "Content-Type": "application/json",
});

/** GET /price-kg-review/queue — entradas de la cola con filtros + paginación. */
export const listQueue = async (query: {
  status?: ReviewQueueStatus;
  reason?: ReviewQueueReason;
  page?: number;
  limit?: number;
} = {}): Promise<ReviewQueuePage> => {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.reason) params.set("reason", query.reason);
  if (query.page) params.set("page", String(query.page));
  if (query.limit) params.set("limit", String(query.limit));
  const qs = params.toString();

  const res = await fetch(`${API_URL}/price-kg-review/queue${qs ? `?${qs}` : ""}`, {
    headers: authHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || "No se pudo cargar la cola de revisión");
  }
  return data;
};

/**
 * POST /price-kg-review/auto-apply — corre el matching planilla↔productos:
 * escribe los matches exactos y encola el resto para revisión del ADMIN.
 */
export const autoApply = async (): Promise<AutoApplyResult> => {
  const res = await fetch(`${API_URL}/price-kg-review/auto-apply`, {
    method: "POST",
    headers: authHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || "No se pudo aplicar la planilla");
  }
  return data;
};

/** POST /price-kg-review/queue/:id/approve — aplica el precio de la celda al producto. */
export const approveEntry = async (id: string): Promise<{ success: boolean }> => {
  const res = await fetch(`${API_URL}/price-kg-review/queue/${id}/approve`, {
    method: "POST",
    headers: authHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || "No se pudo aprobar la entrada");
  }
  return data;
};

/** POST /price-kg-review/queue/:id/reject — descarta la entrada sin tocar el precio. */
export const rejectEntry = async (id: string): Promise<{ success: boolean }> => {
  const res = await fetch(`${API_URL}/price-kg-review/queue/${id}/reject`, {
    method: "POST",
    headers: authHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || "No se pudo rechazar la entrada");
  }
  return data;
};

/**
 * GET /price-kg-products — productos que matchean una celda de la planilla
 * (marca + tipo + especie), para el panel de venta suelta.
 */
export const listProductsForCell = async (query: {
  brandId: string;
  typeId: string;
  species: PriceKgSpecies;
}): Promise<CellProduct[]> => {
  const params = new URLSearchParams({
    brandId: query.brandId,
    typeId: query.typeId,
    species: query.species,
  });

  const res = await fetch(`${API_URL}/price-kg-products?${params.toString()}`, {
    headers: authHeaders(),
  });
  const data = await res.json().catch(() => []);
  if (!res.ok) {
    throw new Error(data.message || "No se pudieron cargar los productos de la celda");
  }
  return Array.isArray(data) ? data : [];
};
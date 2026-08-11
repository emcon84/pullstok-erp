import type { DataItem } from "../../types";

// ── Helpers compartidos del catálogo de vendor ──

export const imgSrc = (image?: string) => {
  if (!image) return null;
  return image.startsWith("http") ? image : undefined;
};

export const branchQty = (p: DataItem) =>
  Number(p.stocks?.[0]?.quantity ?? 0);

/**
 * Unidad de stock para el badge: "kg" si el producto se vende por peso
 * (priceKgSuelto > 0, derivado de price/weightKg/factor en el backend),
 * "u." si se vende por unidad. Mismo criterio que isLooseEligible (backend)
 * y QuantityModal (front).
 */
export const stockUnitLabel = (p: DataItem): string =>
  Number(p.priceKgSuelto ?? 0) > 0 ? "kg" : "u.";

// Clave de sessionStorage para restaurar el filtro del listado al volver del
// scanner (la vista se desmonta al navegar a /scanner y el filtro es local).
export const VENDOR_FILTER_KEY = "vendor-dashboard-filter";

export interface StoredFilter {
  filter: string;
  categoryFilter: string;
  branchId: string;
}

export const readStoredFilter = (branchId: string): StoredFilter | null => {
  try {
    const raw = sessionStorage.getItem(VENDOR_FILTER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredFilter;
    // Solo restauramos si la sucursal coincide (evita cruzar filtros entre
    // vendedores/sucursales que comparten la misma pestaña).
    if (parsed.branchId !== branchId) return null;
    sessionStorage.removeItem(VENDOR_FILTER_KEY);
    return parsed;
  } catch {
    return null;
  }
};

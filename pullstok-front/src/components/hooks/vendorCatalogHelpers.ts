import type { DataItem } from "../../types";

// ── Helpers compartidos del catálogo de vendor ──

export const imgSrc = (image?: string) => {
  if (!image) return null;
  return image.startsWith("http") ? image : undefined;
};

export const branchQty = (p: DataItem) =>
  Number(p.stocks?.[0]?.quantity ?? 0);

/**
 * Unidad de stock para el badge: ProductStock.quantity es SIEMPRE en unidades
 * (bolsas) tras la migración a stock por bolsas. El stock suelto en kg
 * (LooseStock) se muestra aparte, en el panel de celdas / Stock suelto.
 */
export const stockUnitLabel = (_p: DataItem): string => {
  void _p;
  return "u.";
};

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

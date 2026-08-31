import type { DataItem } from "../../types";

// ── Helpers compartidos del catálogo de vendor ──

// sdd/venta-por-unidad-multpack — un multi-pack se puede vender por unidad
// (POR_UNIDAD) SOLO cuando unitsPerBox > 1. `unitPrice` es el precio unitario
// (el backend lo calcula como round2(price/unitsPerBox) y lo expone como
// perUnitPrice); acá lo resolvemos con el dato del backend o derivándolo.

/** ¿El producto es vendible por unidad? Requiere unitsPerBox > 1. */
export const isUnitSellable = (unitsPerBox?: number | null): boolean =>
  !!unitsPerBox && unitsPerBox > 1;

/** Precio unitario de un multi-pack, o null si no es elegible. Usa el
 *  perUnitPrice que ya calculó el backend; si no viene, lo deriva como
 *  round2(price / unitsPerBox). */
export const unitPrice = (p: DataItem): number | null => {
  if (p.perUnitPrice != null) return Number(p.perUnitPrice);
  if (!isUnitSellable(p.unitsPerBox)) return null;
  const price = Number(p.price);
  const ub = Number(p.unitsPerBox);
  if (!price || !ub) return null;
  return Math.round((price / ub) * 100) / 100;
};

/** Cantidad de cajas completas que hay en `units` unidades de stock
 *  (división entera; para mostrar stock de unidades convertido en cajas). */
export const boxCountFromUnits = (units: number, unitsPerBox: number): number =>
  Math.floor(units / unitsPerBox);

export const imgSrc = (image?: string) => {
  if (!image) return null;
  return image.startsWith("http") ? image : undefined;
};

export const branchQty = (p: DataItem) =>
  Number(p.stocks?.[0]?.quantity ?? 0);

/**
 * Stock de un producto de bolsa en UNIDADES (bolsas). La fuente principal
 * SIEMPRE es ProductStock de la sucursal (`p.stocks[0].quantity`, ya en
 * unidades); `products.quantity` es la columna legacy en KG y se usa SOLO como
 * fallback/placeholder cuando no hay stock de sucursal, convertido a bolsas.
 * No toca el flujo de venta suelta (LooseStock en kg, se muestra aparte).
 */
export const unitStock = (p: DataItem): number => {
  const branchQtyVal = p.stocks?.[0]?.quantity;
  // ProductStock (unidades) es autoritativo: si existe un valor (incluso 0) se
  // usa sin conversión.
  if (branchQtyVal != null) return Number(branchQtyVal);
  // Fallback legacy: products.quantity (kg) → round(kg / peso de la bolsa).
  return Math.round((Number(p.quantity) || 0) / (Number(p.weightKg) || 1));
};

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

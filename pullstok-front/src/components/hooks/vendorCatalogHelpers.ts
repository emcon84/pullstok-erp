import type { DataItem } from "../../types";
import type { SaleMode } from "./useVendorCart";

// ── Helpers compartidos del catálogo de vendor ──

// sdd/venta-por-unidad-multpack — un multi-pack se puede vender por unidad
// (POR_UNIDAD) SOLO cuando unitsPerBox > 1. `unitPrice` es el precio unitario
// (el backend lo calcula como round2(price/unitsPerBox) y lo expone como
// perUnitPrice); acá lo resolvemos con el dato del backend o derivándolo.

/** ¿El producto es vendible por unidad? Requiere unitsPerBox > 1. */
export const isUnitSellable = (unitsPerBox?: number | null): boolean =>
  !!unitsPerBox && unitsPerBox > 1;

/** Precio de catálogo efectivo de un producto: mayorista (wholesalePrice) si
 *  el usuario logueado vende mayorista (User.sellsWholesale) y el producto lo
 *  tiene configurado; si no, el precio de mostrador (price). El backend
 *  (salesService) SIEMPRE revalida esto de forma autoritativa al cobrar —
 *  este helper es para mostrar/armar el carrito de forma consistente. */
export const effectivePrice = (p: DataItem, sellsWholesale?: boolean): number =>
  sellsWholesale && p.wholesalePrice != null
    ? Number(p.wholesalePrice)
    : Number(p.price);

/** Precio unitario de un multi-pack, o null si no es elegible. Con
 *  sellsWholesale + wholesalePrice configurado, se deriva de ese precio
 *  (el perUnitPrice del backend es siempre sobre `price`, mostrador). Si no,
 *  usa el perUnitPrice que ya calculó el backend (redondeado hacia arriba al
 *  próximo $100, ej. 18.400/15=1.226,67 → 1.300); si no viene, lo deriva igual. */
export const unitPrice = (p: DataItem, sellsWholesale?: boolean): number | null => {
  if (!isUnitSellable(p.unitsPerBox)) return null;
  const ub = Number(p.unitsPerBox);
  if (sellsWholesale && p.wholesalePrice != null) {
    const wPrice = Number(p.wholesalePrice);
    if (!wPrice || !ub) return null;
    return Math.ceil(wPrice / ub / 100) * 100;
  }
  if (p.perUnitPrice != null) return Number(p.perUnitPrice);
  const price = Number(p.price);
  if (!price || !ub) return null;
  return Math.ceil(price / ub / 100) * 100;
};

// Paso de redondeo del precio por unidad (hacia ARRIBA), espejo de
// UNIT_PRICE_ROUND_STEP en api/src/utils/unitsPerBox.ts.
const UNIT_PRICE_ROUND_STEP = 100;

/**
 * sdd/venta-pastillas-sueltas-blister — espejo (front-only, solo esta
 * función) de `computePerUnitPrice` en api/src/utils/unitsPerBox.ts: precio
 * por unidad = round2(price ÷ units) redondeado HACIA ARRIBA al próximo
 * $100. Se usa para el preview del modal ANTES de confirmar (el server
 * siempre recomputa el precio real al cobrar — este cálculo es solo UX).
 * `null` cuando no se puede derivar (units ausente o <= 0).
 */
export const computePerUnitPrice = (
  price: number,
  units: number | null | undefined,
): number | null => {
  if (units === null || units === undefined || units <= 0) return null;
  const perUnit = price / units;
  return Math.ceil(perUnit / UNIT_PRICE_ROUND_STEP) * UNIT_PRICE_ROUND_STEP;
};

/** Cantidad de cajas completas que hay en `units` unidades de stock
 *  (división entera; para mostrar stock de unidades convertido en cajas). */
export const boxCountFromUnits = (units: number, unitsPerBox: number): number =>
  Math.floor(units / unitsPerBox);

/** Etiqueta de stock de una fila según el modo: unidades ("1500 u.") o cajas
 *  ("100 cajas"). Con el switch "Vender por unidad" OFF y un multi-pack elegible,
 *  el stock se muestra convertido a cajas; si no, siempre en unidades. */
export const stockLabel = (p: DataItem, unitMode: boolean): string => {
  const qty = unitStock(p);
  const ub = Number(p.unitsPerBox);
  if (!unitMode && isUnitSellable(p.unitsPerBox) && ub > 0) {
    return `${boxCountFromUnits(qty, ub)} cajas`;
  }
  return `${qty} u.`;
};

/** Modo de venta de un producto según el switch global "Vender por unidad":
 *  POR_UNIDAD cuando el switch está ON y el multi-pack es vendible por unidad
 *  (unitsPerBox > 1); si no, BOLSA_CERRADA (caja/bolsa cerrada). */
export const saleModeForProduct = (p: DataItem, unitMode: boolean): SaleMode => {
  return unitMode && isUnitSellable(p.unitsPerBox) ? "POR_UNIDAD" : "BOLSA_CERRADA";
};

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

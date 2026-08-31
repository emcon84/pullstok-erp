import type { Sale, SaleMode } from "./salesModel";

// sdd/venta-por-unidad-multpack — clasificación de una venta por sus modos de
// renglón. Funciones puras para que Sales.tsx (y tests) las usen sin duplicar
// la lógica de filtro "Solo sueltas"/"Solo por unidad".

/** ¿La venta es "suelta"? Verdadero si al menos un renglón se vendió por peso
 *  o por monto (modos que el backend asocia a stock suelto / LooseStock).
 *  POR_UNIDAD NO es suelta: es un producto físico vendido por unidad. */
export const isLooseSale = (sale: Sale): boolean =>
  (sale.items || []).some(
    (item) => item.saleMode === "POR_PESO" || item.saleMode === "POR_MONTO",
  );

/** ¿La venta tiene al menos un renglón vendido POR UNIDAD (multi-pack)? */
export const isUnitSale = (sale: Sale): boolean =>
  (sale.items || []).some((item) => item.saleMode === "POR_UNIDAD");

/** Etiqueta legible para el modo de venta de un renglón. Modo ausente o
 *  desconocido → "Caja" (backward-compat con ventas heredadas). */
export const saleModeLabel = (mode?: SaleMode): string => {
  switch (mode) {
    case "POR_UNIDAD":
      return "Por unidad";
    case "POR_PESO":
      return "Suelto (kg)";
    case "POR_MONTO":
      return "Suelto ($)";
    case "BOLSA_CERRADA":
    default:
      return "Caja";
  }
};

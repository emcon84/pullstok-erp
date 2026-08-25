/**
 * Helpers compartidos de las filas del POS del vendedor (bolsa cerrada y
 * venta suelta). Agrupan el parsing de cantidad decimal (con coma, estilo
 * es-AR), el clamping de porcentajes y el formateo por modo para no duplicar
 * la lógica entre VendorCatalogTab, LooseSellTab y VendorOrderPanel.
 */

/** Parsea un string de cantidad decimal ("0,5" ó "0.5") → number ó NaN. */
export const parseDecimal = (raw: string): number => {
  const v = parseFloat(raw.trim().replace(",", "."));
  return Number.isFinite(v) ? v : NaN;
};

/** Clampa un porcentaje de descuento a 0..100. */
export const clampPct = (n: number): number => Math.max(0, Math.min(100, n));

/** Presenta una cantidad en unidades para el input inline de bolsa cerrada. */
export const formatBolsaQty = (qty: number): number =>
  Math.max(1, Math.round(qty));

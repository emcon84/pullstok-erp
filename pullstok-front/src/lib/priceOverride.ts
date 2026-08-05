/**
 * Recalcula el precio nuevo de una fila durante la edición del preview en el
 * cliente. Espejo del `computeNewPrice` del backend: clamp a ≥ 0 y 2 decimales.
 * Solo preview/edición UX — el server es autoritativo al aplicar.
 */
export const recomputeRow = (oldPrice: number, pct: number): number =>
  Math.max(0, Math.round(oldPrice * (1 + pct / 100) * 100) / 100);
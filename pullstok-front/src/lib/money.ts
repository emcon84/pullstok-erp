/**
 * Frontend mirror of api/src/utils/money.ts (D2).
 * Both packages unit-test the same formula locally.
 */
export const round2 = (n: number): number =>
  Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Precio de venta de BOLSA CERRADA (unidad/pack): redondea al múltiplo de 100
 * más cercano. NO se aplica a venta suelta (precio por kg).
 */
export const roundBolsaPrice = (n: number): number =>
  Math.round(n / 100) * 100;

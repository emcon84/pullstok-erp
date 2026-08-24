/**
 * Single money/quantity rounding utility for the whole codebase (design D2).
 * Rounding rule: half-up at 2 decimal places. The EPSILON guard compensates
 * for floating-point drift (e.g. 1.005 * 100 = 100.49999999999999).
 *
 * All boundaries that touch money or decimal kg MUST go through round2:
 *  - priceKgSuelto = round2(price / weightKg * effectiveFactor)   (B-04)
 *  - POR_MONTO kg = round2(amount / priceKgSuelto)                (B-07)
 *  - POR_MONTO total = round2(kg * priceKgSuelto)                 (B-07)
 *  - per-line total = round2(quantity * price)                    (B-08)
 *  - Sale.totalAmount = sum of per-line totals (no re-round)      (B-08)
 */
export const round2 = (n: number): number =>
  Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Precio de venta de BOLSA CERRADA (unidad/pack): redondea al múltiplo de 100
 * más cercano. NO se aplica a venta suelta (precio por kg) ni a suggestedPrice.
 */
export const roundBolsaPrice = (n: number): number =>
  Math.round(n / 100) * 100;

/**
 * Redondea el precio de bolsa solo cuando el precio es >= 500. Debajo del
 * umbral se conserva tal cual (el user eligió este piso para no saltar
 * accesorios baratos). Guarda igual a la del frontend (roundBolsaPrice en
 * pullstok-front/src/lib/money.ts).
 */
export const roundBolsaPriceIfHigh = (n: number): number =>
  n >= 500 ? roundBolsaPrice(n) : n;
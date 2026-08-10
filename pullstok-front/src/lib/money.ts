/**
 * Frontend mirror of api/src/utils/money.ts (D2).
 * Both packages unit-test the same formula locally.
 */
export const round2 = (n: number): number =>
  Math.round((n + Number.EPSILON) * 100) / 100;

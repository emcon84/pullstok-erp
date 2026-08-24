import { describe, it, expect } from "vitest";
import { round2, roundBolsaPrice } from "./money";

describe("money — round2 (frontend mirror of api/src/utils/money.ts, D2)", () => {
  it("rounds half-up: 1.005 → 1.01", () => {
    expect(round2(1.005)).toBe(1.01);
  });

  it("rounds exact: 150.25 stays 150.25", () => {
    expect(round2(150.25)).toBe(150.25);
  });

  it("rounds down: 1.004 → 1.00", () => {
    expect(round2(1.004)).toBe(1);
  });

  it("3.33 × 150.25 = 500.3325 → 500.33 (B-07 spec)", () => {
    expect(round2(3.33 * 150.25)).toBe(500.33);
  });

  it("4500 / 15 × 1.2 = 360.00 (B-04 spec)", () => {
    expect(round2((4500 / 15) * 1.2)).toBe(360);
  });

  it("zero stays zero", () => {
    expect(round2(0)).toBe(0);
  });
});

describe("money — roundBolsaPrice (bolsa cerrada a múltiplo de 100)", () => {
  it("3483,6 → 3500", () => {
    expect(roundBolsaPrice(3483.6)).toBe(3500);
  });

  it("3483 → 3500", () => {
    expect(roundBolsaPrice(3483)).toBe(3500);
  });

  it("3403 → 3400", () => {
    expect(roundBolsaPrice(3403)).toBe(3400);
  });

  it("3450 → 3500", () => {
    expect(roundBolsaPrice(3450)).toBe(3500);
  });

  it("ya múltiplo de 100 se mantiene", () => {
    expect(roundBolsaPrice(3500)).toBe(3500);
  });

  it("midpoint exacto (en cents) redondea hacia arriba", () => {
    expect(roundBolsaPrice(3450.01)).toBe(3500);
    expect(roundBolsaPrice(3449.99)).toBe(3400);
  });

  it("cero se mantiene", () => {
    expect(roundBolsaPrice(0)).toBe(0);
  });
});

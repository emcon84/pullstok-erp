import { describe, it, expect } from "vitest";
import {
  clampSurchargePct,
  computeSurcharge,
  applySurchargeToPayments,
} from "@/lib/surcharge";

describe("clampSurchargePct", () => {
  it("clamps to 0..100 and tolerates junk", () => {
    expect(clampSurchargePct(-5)).toBe(0);
    expect(clampSurchargePct(150)).toBe(100);
    expect(clampSurchargePct(10)).toBe(10);
    expect(clampSurchargePct(Number.NaN)).toBe(0);
    expect(clampSurchargePct(undefined)).toBe(0);
  });
});

describe("computeSurcharge", () => {
  it("charges only the TARJETA_CREDITO rows", () => {
    const payments = [
      { method: "EFECTIVO" as const, amount: 1000 },
      { method: "TARJETA_CREDITO" as const, amount: 500 },
      { method: "TARJETA_DEBITO" as const, amount: 300 },
    ];
    expect(computeSurcharge(payments, 10)).toBe(50);
  });

  it("rounds per row and sums the rounded rows", () => {
    // 100.05 * 5% = 5.0025 -> 5; 33.33 * 5% = 1.6665 -> 1.67
    const payments = [
      { method: "TARJETA_CREDITO" as const, amount: 100.05 },
      { method: "TARJETA_CREDITO" as const, amount: 33.33 },
    ];
    expect(computeSurcharge(payments, 5)).toBe(6.67);
  });

  it("is 0 without card rows, with pct 0 or with no payments", () => {
    expect(computeSurcharge([{ method: "EFECTIVO", amount: 100 }], 10)).toBe(0);
    expect(computeSurcharge([{ method: "TARJETA_CREDITO", amount: 100 }], 0)).toBe(0);
    expect(computeSurcharge([], 10)).toBe(0);
    expect(computeSurcharge(undefined, 10)).toBe(0);
  });

  it("clamps the pct before applying it", () => {
    expect(computeSurcharge([{ method: "TARJETA_CREDITO", amount: 100 }], 250)).toBe(100);
    expect(computeSurcharge([{ method: "TARJETA_CREDITO", amount: 100 }], -3)).toBe(0);
  });
});

describe("applySurchargeToPayments", () => {
  it("adds each card row's surcharge to what was actually charged", () => {
    const out = applySurchargeToPayments(
      [
        { method: "EFECTIVO", amount: 1000 },
        { method: "TARJETA_CREDITO", amount: 500 },
      ],
      10,
    );
    expect(out).toEqual([
      { method: "EFECTIVO", amount: 1000 },
      { method: "TARJETA_CREDITO", amount: 550 },
    ]);
  });

  it("returns the payments unchanged when pct is 0", () => {
    const p = [{ method: "TARJETA_CREDITO" as const, amount: 500 }];
    expect(applySurchargeToPayments(p, 0)).toEqual(p);
  });
});

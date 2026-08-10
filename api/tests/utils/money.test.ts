import { round2 } from "../../src/utils/money";

describe("round2 — half-up rounding at 2dp (D2)", () => {
  it("rounds 1.005 up to 1.01 (half-up, EPSILON guard against FP drift)", () => {
    expect(round2(1.005)).toBe(1.01);
  });

  it("keeps exact 2dp values unchanged", () => {
    expect(round2(360)).toBe(360);
    expect(round2(3.33)).toBe(3.33);
  });

  it("rounds the B-04 formula result 4500/15*1.2 = 360 exactly", () => {
    expect(round2(4500 / 15 * 1.2)).toBe(360);
  });

  it("reproduces the B-07 by-amount reconciliation: kg=round2(3.3278)=3.33, total=round2(3.33*150.25)=500.33", () => {
    const kg = round2(500 / 150.25);
    expect(kg).toBe(3.33);
    const total = round2(kg * 150.25);
    expect(total).toBe(500.33);
  });

  it("rounds half-down cases (.005 boundary from below) deterministically", () => {
    expect(round2(1.004)).toBe(1.0);
    expect(round2(1.015)).toBe(1.02);
  });

  it("rounds zero without crashing", () => {
    expect(round2(0)).toBe(0);
  });
});
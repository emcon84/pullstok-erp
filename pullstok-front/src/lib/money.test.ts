import { describe, it, expect } from "vitest";
import { round2 } from "./money";

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

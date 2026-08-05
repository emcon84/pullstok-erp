import { describe, it, expect } from "vitest";
import { recomputeRow } from "./priceOverride";

describe("recomputeRow — mirror of computeNewPrice (client preview only)", () => {
  it("applies a positive percentage to the old price", () => {
    expect(recomputeRow(100, 10)).toBe(110);
  });

  it("applies a negative percentage (discount)", () => {
    expect(recomputeRow(100, -20)).toBe(80);
  });

  it("clamps the result at 0 for -100%", () => {
    expect(recomputeRow(100, -100)).toBe(0);
  });

  it("rounds to 2 decimals like the server", () => {
    expect(recomputeRow(100, 33.333)).toBe(133.33);
  });

  it("keeps the price unchanged for a 0% override (included but same)", () => {
    expect(recomputeRow(123.45, 0)).toBe(123.45);
  });
});
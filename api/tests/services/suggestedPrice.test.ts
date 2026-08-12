import { computeSuggestedPrice } from "../../src/services/providerPriceListService";

/**
 * Suggested price computation (spec REQ-7, design §3.4 precision note).
 * Markup is a constant 33.34%: suggestedPrice = round2(Con IVA × 1.3334).
 *
 * Precision finding: round2(10642 × 1.3334) = 14190.04, NOT 14190 — the PDF
 * truncates to an integer (the supplier's own formatting). The formula wins
 * (round2), the plan prints our values, and this is documented here.
 */
describe("computeSuggestedPrice — round2(Con IVA × 1.3334)", () => {
  it("computes the spec case with the documented precision (10642 → 14190.04)", () => {
    expect(computeSuggestedPrice(10642, 8795)).toBe(14190.04);
  });

  it("falls back to round2(round2(SIN IVA × 1.21) × 1.3334) when Con IVA is missing", () => {
    // SIN IVA 8795 → Con IVA 10641.95 → sugerido round2(10641.95 × 1.3334) = 14189.98
    expect(computeSuggestedPrice(null, 8795)).toBe(14189.98);
  });

  it("returns null when no price is derivable", () => {
    expect(computeSuggestedPrice(null, null)).toBeNull();
  });

  it("ignores the PDF's own suggested column (uses Con IVA, not the printed integer)", () => {
    // Even though the PDF prints 14190, our formula is authoritative.
    expect(computeSuggestedPrice(10642, 8795)).not.toBe(14190);
  });

  it("rounds to 2 decimals for WET decimal prices (2571.7 × 1.3334 → 3429.1)", () => {
    expect(computeSuggestedPrice(2571.7, 2125.4)).toBe(3429.1);
  });
});

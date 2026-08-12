import { normalizePrice } from "../../src/services/providerPriceListService";

/**
 * AR price normalization (spec REQ-3, design §3.4). Our own algorithm — the
 * existing parsePrice() in scripts/load-distributor-pdfs.ts is buggy for
 * integer thousands ("8.795" → 8.795 instead of 8795) and must NOT be reused.
 */
describe("normalizePrice — AR thousand/decimal separators", () => {
  it("turns integer thousands into a plain integer (8.795 → 8795)", () => {
    expect(normalizePrice("8.795")).toBe(8795);
  });

  it("parses comma decimal with no thousands (1.658,00 → 1658)", () => {
    expect(normalizePrice("1.658,00")).toBe(1658);
  });

  it("keeps a single dot decimal (10.5 → 10.5)", () => {
    expect(normalizePrice("10.5")).toBe(10.5);
  });

  it("turns thousand groups into integer (1.000 → 1000)", () => {
    expect(normalizePrice("1.000")).toBe(1000);
  });

  it("strips currency symbol and spaces ($ 1.500 → 1500)", () => {
    expect(normalizePrice("$ 1.500")).toBe(1500);
  });

  it("passes through a plain integer (8795 → 8795)", () => {
    expect(normalizePrice("8795")).toBe(8795);
  });

  it("handles both separators with comma as decimal (2.125,4 → 2125.4)", () => {
    expect(normalizePrice("2.125,4")).toBe(2125.4);
  });

  it("handles both separators with comma as decimal (9.802,78 → 9802.78)", () => {
    expect(normalizePrice("9.802,78")).toBe(9802.78);
  });

  it("handles three-digit decimals kept as decimal (9.802,78 style)", () => {
    expect(normalizePrice("2.571,7")).toBe(2571.7);
  });

  it("returns null for non-numeric input (abc)", () => {
    expect(normalizePrice("abc")).toBeNull();
  });

  it("returns null for inconsistent duplicated separators (1..2)", () => {
    expect(normalizePrice("1..2")).toBeNull();
  });

  it("returns null for a dash placeholder (-)", () => {
    expect(normalizePrice("-")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(normalizePrice("")).toBeNull();
  });

  it("handles a non-breaking space inside the number", () => {
    expect(normalizePrice("1\u00A0500")).toBe(1500);
  });
});

import { describe, it, expect } from "vitest";
import {
  PresentationError,
  toStockLevels,
  formatStockLevels,
  levelsToBaseUnits,
  validatePresentationSet,
  resolvePresentationPrice,
  buildQuickSetup,
  findLegacyBlisterPrice,
  isSellablePresentation,
} from "@/components/hooks/presentationHelpers";

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(PresentationError);
    return (e as PresentationError).code;
  }
  return null;
};

const set = [
  { name: "Caja", factor: 100, isActive: true },
  { name: "Blister", factor: 10, isActive: true },
  { name: "Unidad", factor: 1, isActive: true },
];

describe("toStockLevels", () => {
  it("splits greedily by factor desc", () => {
    expect(toStockLevels(235, set)).toEqual([
      { name: "Caja", count: 2 },
      { name: "Blister", count: 3 },
      { name: "Unidad", count: 5 },
    ]);
  });

  it("sorts by factor even when the input is unordered", () => {
    expect(toStockLevels(235, [set[2], set[0], set[1]])[0]).toEqual({ name: "Caja", count: 2 });
  });

  it("omits zero levels", () => {
    expect(toStockLevels(205, set)).toEqual([
      { name: "Caja", count: 2 },
      { name: "Unidad", count: 5 },
    ]);
  });

  it("shows the base level when total is 0", () => {
    expect(toStockLevels(0, set)).toEqual([{ name: "Unidad", count: 0 }]);
  });

  it("ignores inactive presentations", () => {
    const s = [{ name: "Caja", factor: 10, isActive: false }, { name: "Unidad", factor: 1, isActive: true }];
    expect(toStockLevels(25, s)).toEqual([{ name: "Unidad", count: 25 }]);
  });

  it("treats presentations without isActive as active (API list is active-only)", () => {
    expect(toStockLevels(12, [{ name: "Caja", factor: 10 }, { name: "Unidad", factor: 1 }])).toEqual([
      { name: "Caja", count: 1 },
      { name: "Unidad", count: 2 },
    ]);
  });
});

describe("stock levels with pending (factor 0) presentations", () => {
  const withPending = [
    { name: "Caja", factor: 0, isActive: true },
    { name: "Blister", factor: 10, isActive: true },
    { name: "Unidad", factor: 1, isActive: true },
  ];
  it("skips factor < 1 without dividing by zero", () => {
    expect(toStockLevels(25, withPending)).toEqual([
      { name: "Blister", count: 2 },
      { name: "Unidad", count: 5 },
    ]);
    expect(formatStockLevels(25, withPending)).toBe("2 Blister · 5 Unidad");
  });
  it("the zero-total fallback shows the base level, never a pending one", () => {
    expect(toStockLevels(0, withPending)).toEqual([{ name: "Unidad", count: 0 }]);
  });
  it("levelsToBaseUnits ignores pending presentations", () => {
    expect(levelsToBaseUnits({ Caja: 5, Blister: 1, Unidad: 2 }, withPending)).toBe(12);
  });
});

describe("isSellablePresentation", () => {
  it("is true only for a price above zero", () => {
    expect(isSellablePresentation({ price: 120 })).toBe(true);
    expect(isSellablePresentation({ price: 0 })).toBe(false);
  });
});

describe("formatStockLevels", () => {
  it("joins levels keeping the configured names", () => {
    expect(formatStockLevels(235, set)).toBe("2 Caja · 3 Blister · 5 Unidad");
  });

  it("shows the base level at zero", () => {
    expect(formatStockLevels(0, set)).toBe("0 Unidad");
  });
});

describe("levelsToBaseUnits", () => {
  it("converts per-presentation counts to base units", () => {
    expect(levelsToBaseUnits({ Caja: 2, Blister: 3, Unidad: 5 }, set)).toBe(235);
  });

  it("ignores missing, negative or non-integer garbage as zero", () => {
    expect(levelsToBaseUnits({ Caja: 1, Unidad: Number.NaN }, set)).toBe(100);
    expect(levelsToBaseUnits({}, set)).toBe(0);
  });

  it("round-trips with toStockLevels", () => {
    const levels = toStockLevels(347, set);
    const counts = Object.fromEntries(levels.map((l) => [l.name, l.count]));
    expect(levelsToBaseUnits(counts, set)).toBe(347);
  });
});

describe("validatePresentationSet", () => {
  const ok = [
    { name: "Caja", factor: 10, isActive: true },
    { name: "Unidad", factor: 1, isActive: true },
  ];

  it("accepts a valid set", () => {
    expect(() => validatePresentationSet(ok)).not.toThrow();
  });

  it("requires exactly one active factor-1 presentation", () => {
    expect(codeOf(() => validatePresentationSet([ok[0]]))).toBe("PRESENTATION_BASE_REQUIRED");
    expect(
      codeOf(() => validatePresentationSet([...ok, { name: "Pieza", factor: 1, isActive: true }])),
    ).toBe("PRESENTATION_BASE_REQUIRED");
    expect(
      codeOf(() => validatePresentationSet([ok[0], { ...ok[1], isActive: false }])),
    ).toBe("PRESENTATION_BASE_REQUIRED");
  });

  it("rejects non-integer or negative factors", () => {
    expect(codeOf(() => validatePresentationSet([ok[1], { name: "X", factor: -1, isActive: true }]))).toBe("PRESENTATION_FACTOR_INVALID");
    expect(codeOf(() => validatePresentationSet([ok[1], { name: "X", factor: 2.5, isActive: true }]))).toBe("PRESENTATION_FACTOR_INVALID");
  });

  it("accepts factor 0 (pendiente) on a non-base presentation", () => {
    expect(() => validatePresentationSet([ok[1], { name: "Caja", factor: 0, isActive: true }])).not.toThrow();
  });

  it("factor 0 does not count as the base: a set with only factor 0 + factor 10 still needs a base", () => {
    expect(codeOf(() => validatePresentationSet([ok[0], { name: "Blister", factor: 0, isActive: true }]))).toBe("PRESENTATION_BASE_REQUIRED");
  });

  it("rejects duplicate names (case-insensitive, trimmed)", () => {
    expect(codeOf(() => validatePresentationSet([ok[1], { name: " unidad ", factor: 5, isActive: false }]))).toBe("PRESENTATION_NAME_DUPLICATE");
  });
});

describe("resolvePresentationPrice", () => {
  const box = { price: 1000, wholesalePrice: 800 };
  it("uses the wholesale price for wholesale sellers when set", () => {
    expect(resolvePresentationPrice(box, true)).toBe(800);
  });
  it("uses the retail price for retail sellers", () => {
    expect(resolvePresentationPrice(box, false)).toBe(1000);
  });
  it("falls back to price when wholesalePrice is null", () => {
    expect(resolvePresentationPrice({ price: 120, wholesalePrice: null }, true)).toBe(120);
  });
});

describe("buildQuickSetup", () => {
  const prices = { box: "2000", blister: "250", pill: "30" };

  it("computes factors: Pastilla 1, Blister = pills per blister, Caja = blisters x pills", () => {
    const set = buildQuickSetup({ blistersPerBox: "4", pillsPerBlister: "10", prices });
    expect(set.map((p) => [p.name, p.factor])).toEqual([
      ["Caja", 40],
      ["Blister", 10],
      ["Pastilla", 1],
    ]);
    expect(set.map((p) => p.sortOrder)).toEqual([0, 1, 2]);
    expect(set.every((p) => p.isActive && p.wholesalePrice === null)).toBe(true);
  });

  it("triangulates with other inputs", () => {
    const set = buildQuickSetup({ blistersPerBox: "3", pillsPerBlister: "7", prices });
    expect(set.map((p) => p.factor)).toEqual([21, 7, 1]);
  });

  it("never derives prices: each one is exactly what was typed", () => {
    const a = buildQuickSetup({ blistersPerBox: "4", pillsPerBlister: "10", prices });
    expect(a.map((p) => p.price)).toEqual([2000, 250, 30]);
    const b = buildQuickSetup({ blistersPerBox: "8", pillsPerBlister: "5", prices });
    expect(b.map((p) => p.price)).toEqual([2000, 250, 30]); // factors changed, prices did not
  });

  it("accepts 0 counts: missing data yields factor 0 (pendiente)", () => {
    const a = buildQuickSetup({ blistersPerBox: "0", pillsPerBlister: "10", prices });
    expect(a.map((p) => p.factor)).toEqual([0, 10, 1]);
    const b = buildQuickSetup({ blistersPerBox: "4", pillsPerBlister: "0", prices });
    expect(b.map((p) => p.factor)).toEqual([0, 0, 1]);
  });

  it("rejects non-integer or negative counts", () => {
    expect(codeOf(() => buildQuickSetup({ blistersPerBox: "-1", pillsPerBlister: "10", prices }))).toBe("PRESENTATION_FACTOR_INVALID");
    expect(codeOf(() => buildQuickSetup({ blistersPerBox: "2", pillsPerBlister: "2.5", prices }))).toBe("PRESENTATION_FACTOR_INVALID");
    expect(codeOf(() => buildQuickSetup({ blistersPerBox: "", pillsPerBlister: "10", prices }))).toBe("PRESENTATION_FACTOR_INVALID");
  });

  it("rejects missing or negative prices", () => {
    expect(codeOf(() => buildQuickSetup({ blistersPerBox: "2", pillsPerBlister: "10", prices: { ...prices, blister: "" } }))).toBe("PRESENTATION_PRICE_INVALID");
    expect(codeOf(() => buildQuickSetup({ blistersPerBox: "2", pillsPerBlister: "10", prices: { ...prices, pill: "-1" } }))).toBe("PRESENTATION_PRICE_INVALID");
  });

  it("produces a set accepted by validatePresentationSet", () => {
    const set = buildQuickSetup({ blistersPerBox: "4", pillsPerBlister: "10", prices });
    expect(() => validatePresentationSet(set)).not.toThrow();
  });
});

describe("findLegacyBlisterPrice", () => {
  const catalog = [
    { name: "Ibuprofeno 400", price: 2000 },
    { name: "  ibuprofeno 400 (blister) ", price: "250.5" },
    { name: "Otro (Blister)", price: 99 },
  ];

  it("finds '<name> (Blister)' case-insensitively and trimmed, returning name and numeric price", () => {
    expect(findLegacyBlisterPrice("Ibuprofeno 400", catalog)).toEqual({
      name: "ibuprofeno 400 (blister)",
      price: 250.5,
    });
  });

  it("returns null when there is no such duplicate", () => {
    expect(findLegacyBlisterPrice("Paracetamol", catalog)).toBeNull();
    expect(findLegacyBlisterPrice("Ibuprofeno 400", [catalog[0]])).toBeNull();
  });
});

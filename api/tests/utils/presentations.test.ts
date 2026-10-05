import {
  PresentationError,
  resolvePresentationLine,
  toStockLevels,
  isFarmaciaCategoryName,
  validatePresentationSet,
} from "../../src/utils/presentations";

const box = { id: "p-box", name: "Caja", factor: 10, price: 1000, wholesalePrice: 800, isActive: true };
const unit = { id: "p-unit", name: "Unidad", factor: 1, price: 120, wholesalePrice: null, isActive: true };
const product = { hasPresentations: true, presentations: [box, unit] };

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(PresentationError);
    return (e as PresentationError).code;
  }
  return null;
};

describe("resolvePresentationLine", () => {
  it("returns the retail price and snapshot", () => {
    expect(resolvePresentationLine(product, "p-box", false)).toEqual({
      presentationId: "p-box", name: "Caja", factor: 10, price: 1000,
    });
  });

  it("uses wholesalePrice for wholesale sellers when set", () => {
    expect(resolvePresentationLine(product, "p-box", true).price).toBe(800);
  });

  it("falls back to price when wholesalePrice is null", () => {
    expect(resolvePresentationLine(product, "p-unit", true).price).toBe(120);
  });

  it("accepts Decimal-like wholesale values", () => {
    const dec = { ...box, wholesalePrice: { toString: () => "799.5" } };
    expect(
      resolvePresentationLine({ hasPresentations: true, presentations: [dec] }, "p-box", true).price,
    ).toBe(799.5);
  });

  it("PRESENTATION_REQUIRED when enabled and no id", () => {
    expect(codeOf(() => resolvePresentationLine(product, undefined, false))).toBe("PRESENTATION_REQUIRED");
  });

  it("PRESENTATION_NOT_ALLOWED when id sent for a legacy product", () => {
    expect(
      codeOf(() => resolvePresentationLine({ hasPresentations: false, presentations: [] }, "x", false)),
    ).toBe("PRESENTATION_NOT_ALLOWED");
  });

  it("PRESENTATION_NOT_FOUND when id is not in the product list", () => {
    expect(codeOf(() => resolvePresentationLine(product, "other", false))).toBe("PRESENTATION_NOT_FOUND");
  });

  it("PRESENTATION_NOT_SELLABLE when the price is 0", () => {
    const p = { hasPresentations: true, presentations: [{ ...unit, id: "p-zero", price: 0, wholesalePrice: null }] };
    expect(codeOf(() => resolvePresentationLine(p, "p-zero", false))).toBe("PRESENTATION_NOT_SELLABLE");
  });

  it("factor 0 with a positive price is sellable", () => {
    const p = { hasPresentations: true, presentations: [{ ...box, factor: 0 }] };
    expect(resolvePresentationLine(p, "p-box", false)).toMatchObject({ factor: 0, price: 1000 });
  });

  it("PRESENTATION_INACTIVE when the presentation is disabled", () => {
    const p = { hasPresentations: true, presentations: [{ ...box, isActive: false }, unit] };
    expect(codeOf(() => resolvePresentationLine(p, "p-box", false))).toBe("PRESENTATION_INACTIVE");
  });
});

describe("toStockLevels", () => {
  const set = [
    { name: "Caja", factor: 100, isActive: true },
    { name: "Blister", factor: 10, isActive: true },
    { name: "Unidad", factor: 1, isActive: true },
  ];

  it("splits greedily by factor desc", () => {
    expect(toStockLevels(235, set)).toEqual([
      { name: "Caja", count: 2 },
      { name: "Blister", count: 3 },
      { name: "Unidad", count: 5 },
    ]);
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

  it("skips factor 0 (pending) presentations", () => {
    const s = [
      { name: "Caja", factor: 0, isActive: true },
      { name: "Blister", factor: 0, isActive: true },
      { name: "Pastilla", factor: 1, isActive: true },
    ];
    expect(toStockLevels(7, s)).toEqual([{ name: "Pastilla", count: 7 }]);
  });

  it("ignores inactive presentations", () => {
    const s = [{ name: "Caja", factor: 10, isActive: false }, { name: "Unidad", factor: 1, isActive: true }];
    expect(toStockLevels(25, s)).toEqual([{ name: "Unidad", count: 25 }]);
  });
});

describe("isFarmaciaCategoryName", () => {
  it.each(["FARMACIA", " farmacia ", "Farmacia"])("matches %p", (n) => {
    expect(isFarmaciaCategoryName(n)).toBe(true);
  });
  it.each(["Farmacia 2", "", null, undefined])("rejects %p", (n) => {
    expect(isFarmaciaCategoryName(n as any)).toBe(false);
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

  it("accepts factor 0 (pending) next to the active base", () => {
    expect(() => validatePresentationSet([ok[1], { name: "Blister", factor: 0, isActive: true }])).not.toThrow();
  });

  it("factor 0 never counts as the base", () => {
    expect(
      codeOf(() => validatePresentationSet([{ name: "Blister", factor: 0, isActive: true }])),
    ).toBe("PRESENTATION_BASE_REQUIRED");
  });

  it("rejects duplicate names (case-insensitive, trimmed)", () => {
    expect(codeOf(() => validatePresentationSet([ok[1], { name: " unidad ", factor: 5, isActive: false }]))).toBe("PRESENTATION_NAME_DUPLICATE");
  });
});

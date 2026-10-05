import { describe, it, expect } from "vitest";
import {
  sellablePresentations,
  defaultPresentationId,
  presentationContentHint,
  presentationStockCap,
  presentationLineName,
  isPresentationDisabled,
} from "../components/hooks/presentationHelpers";
import type { ProductPresentation } from "../types";

const p = (o: Partial<ProductPresentation> & { id: string; name: string }): ProductPresentation => ({
  factor: 1, price: 100, wholesalePrice: null, sortOrder: 0, ...o,
});
const caja = p({ id: "c", name: "Caja", factor: 100, price: 900, sortOrder: 0 });
const blister = p({ id: "b", name: "Blister", factor: 10, price: 150, sortOrder: 1 });
const pastilla = p({ id: "p", name: "Pastilla", factor: 1, price: 20, sortOrder: 2 });

describe("sellablePresentations", () => {
  it("hides price 0 and keeps the order", () => {
    const zero = { ...pastilla, price: 0 };
    expect(sellablePresentations([caja, blister, zero]).map((x) => x.id)).toEqual(["c", "b"]);
    expect(sellablePresentations(undefined)).toEqual([]);
  });
});

describe("defaultPresentationId", () => {
  it("picks the largest factor", () => {
    expect(defaultPresentationId([pastilla, blister, caja])).toBe("c");
  });
  it("breaks ties and factor-0 sets by sortOrder", () => {
    const a = { ...caja, factor: 0, sortOrder: 3 };
    const b = { ...blister, factor: 0, sortOrder: 1 };
    expect(defaultPresentationId([a, b])).toBe("b");
  });
  it("is null for an empty list", () => {
    expect(defaultPresentationId([])).toBeNull();
  });
});

describe("presentationContentHint", () => {
  const all = [caja, blister, pastilla];
  it("uses the base name pluralized", () => {
    expect(presentationContentHint(blister, all)).toBe("10 pastillas");
    expect(presentationContentHint(p({ id: "x", name: "Caja", factor: 3 }), [
      p({ id: "u", name: "Unidad", factor: 1 }),
    ])).toBe("3 unidades");
  });
  it("is empty for the base and for factor 0", () => {
    expect(presentationContentHint(pastilla, all)).toBe("");
    expect(presentationContentHint({ ...blister, factor: 0 }, all)).toBe("");
  });
});

describe("stock helpers", () => {
  it("presentationStockCap divides by factor; factor 0 is uncapped", () => {
    expect(presentationStockCap(blister, 25)).toBe(2);
    expect(presentationStockCap({ ...blister, factor: 0 }, 0)).toBe(Number.MAX_SAFE_INTEGER);
  });
  it("isPresentationDisabled only when stock is known and short", () => {
    expect(isPresentationDisabled(caja, 99)).toBe(true);
    expect(isPresentationDisabled(caja, 100)).toBe(false);
    expect(isPresentationDisabled(caja, null)).toBe(false);
    expect(isPresentationDisabled({ ...caja, factor: 0 }, 0)).toBe(false);
  });
});

it("presentationLineName", () => {
  expect(presentationLineName("Ibuprofeno", "Blister")).toBe("Ibuprofeno (Blister)");
});

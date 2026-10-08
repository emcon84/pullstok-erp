import { describe, it, expect } from "vitest";
import { formatQuantity, roundQuantity } from "../utils/formatQuantity";

describe("formatQuantity", () => {
  it("keeps integers without decimals", () => {
    expect(formatQuantity(10)).toBe("10");
  });
  it("rounds to max 3 decimals with es-AR separators", () => {
    expect(formatQuantity(1134.6451000000002)).toBe("1.134,645");
    expect(formatQuantity(194.01)).toBe("194,01");
  });
  it("appends the kg suffix when unit is kg", () => {
    expect(formatQuantity(1134.6451000000002, "kg")).toBe("1.134,645 kg");
    expect(formatQuantity(3, "kg")).toBe("3 kg");
  });
});

describe("roundQuantity", () => {
  it("rounds to 3 decimals as a number", () => {
    expect(roundQuantity(1134.6451000000002)).toBe(1134.645);
  });
});

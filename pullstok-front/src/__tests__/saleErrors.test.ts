import { describe, it, expect } from "vitest";
import { saleErrorMessage } from "../utils/saleErrors";

describe("saleErrorMessage", () => {
  it.each([
    ["PRESENTATION_NOT_SELLABLE", /sin precio/i],
    ["USE_PRESENTATION", /presentación/i],
    ["PRESENTATION_REQUIRED", /Elegí una presentación/],
    ["PRESENTATION_NOT_ALLOWED", /no maneja presentaciones/],
    ["PRESENTATION_NOT_FOUND", /no pertenece/],
    ["PRESENTATION_INACTIVE", /inactiva/],
  ])("maps %s to Spanish copy", (code, re) => {
    expect(saleErrorMessage({ code, message: "raw" }, "fallback")).toMatch(re);
  });

  it("falls back to the server message, then to the default", () => {
    expect(saleErrorMessage({ code: "OTHER", message: "Stock insuficiente" }, "fb")).toBe("Stock insuficiente");
    expect(saleErrorMessage(undefined, "fb")).toBe("fb");
    expect(saleErrorMessage("boom", "fb")).toBe("boom");
  });
});

import { describe, it, expect } from "vitest";
import { customerDisplayName, NO_NAME_LABEL } from "../utils/customerName";

describe("customerDisplayName", () => {
  it("returns the trimmed name when present", () => {
    expect(customerDisplayName({ name: "  Ana " })).toBe("Ana");
  });

  it.each([null, undefined, "", "   "])("falls back to 'Sin nombre' for %j", (name) => {
    expect(customerDisplayName({ name })).toBe(NO_NAME_LABEL);
    expect(NO_NAME_LABEL).toBe("Sin nombre");
  });

  it("falls back for a missing customer", () => {
    expect(customerDisplayName(null)).toBe("Sin nombre");
    expect(customerDisplayName(undefined)).toBe("Sin nombre");
  });
});

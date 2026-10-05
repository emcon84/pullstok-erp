import {
  presentationInputSchema,
  replacePresentationsSchema,
  enablePresentationsSchema,
  createProductSchema,
  updateProductSchema,
} from "../../src/validation/schemas";

const valid = { name: "  Caja ", sortOrder: 0, factor: 10, price: 100, wholesalePrice: null, isActive: true };

describe("presentationInputSchema", () => {
  it("trims the name and accepts an optional id", () => {
    const r = presentationInputSchema.parse({ ...valid, id: "abc" });
    expect(r.name).toBe("Caja");
    expect(r.id).toBe("abc");
  });

  it.each([
    ["empty name", { name: "   " }],
    ["negative factor", { factor: -1 }],
    ["fractional factor", { factor: 1.5 }],
    ["negative price", { price: -1 }],
    ["negative wholesale", { wholesalePrice: -1 }],
    ["fractional sortOrder", { sortOrder: 0.5 }],
  ])("rejects %s", (_l, patch) => {
    expect(presentationInputSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
});

describe("replace / enable schemas", () => {
  it("replace requires a non-empty presentations array", () => {
    expect(replacePresentationsSchema.safeParse({ presentations: [] }).success).toBe(false);
    expect(replacePresentationsSchema.safeParse({ presentations: [valid] }).success).toBe(true);
  });

  it("enable accepts an optional stockCountedIn presentation name", () => {
    const r = enablePresentationsSchema.parse({ presentations: [valid], stockCountedIn: " Caja " });
    expect(r.stockCountedIn).toBe("Caja");
    expect(enablePresentationsSchema.safeParse({ presentations: [valid] }).success).toBe(true);
  });
});

describe("product schemas ignore hasPresentations", () => {
  const base = { name: "X", price: 1, categoryId: "c", quantity: 1 };
  it("strips it on create and update", () => {
    expect(createProductSchema.parse({ ...base, hasPresentations: true })).not.toHaveProperty("hasPresentations");
    expect(updateProductSchema.parse({ hasPresentations: true })).not.toHaveProperty("hasPresentations");
  });
});

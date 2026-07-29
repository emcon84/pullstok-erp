/**
 * Zod schema unit tests — Categories + Variants (categories-variants-redesign)
 * Tests schema validation in isolation (no DB needed).
 */
import {
  createCategorySchema,
  updateCategorySchema,
  createVariantSchema,
  updateVariantSchema,
  createVariantOptionSchema,
  updateVariantOptionSchema,
  createProductSchema,
  updateProductSchema,
} from "../schemas";

describe("createCategorySchema", () => {
  it("accepts name without parentId", () => {
    const result = createCategorySchema.safeParse({ name: "Test" });
    expect(result.success).toBe(true);
  });

  it("accepts name with optional parentId (valid UUID)", () => {
    const result = createCategorySchema.safeParse({
      name: "Test",
      parentId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid parentId (non-UUID)", () => {
    const result = createCategorySchema.safeParse({
      name: "Test",
      parentId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty name", () => {
    const result = createCategorySchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing name", () => {
    const result = createCategorySchema.safeParse({ parentId: "550e8400-e29b-41d4-a716-446655440000" });
    expect(result.success).toBe(false);
  });
});

describe("updateCategorySchema", () => {
  it("accepts name only", () => {
    const result = updateCategorySchema.safeParse({ name: "New Name" });
    expect(result.success).toBe(true);
  });

  it("accepts parentId as null (move to root)", () => {
    const result = updateCategorySchema.safeParse({
      name: "Test",
      parentId: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts parentId as valid UUID", () => {
    const result = updateCategorySchema.safeParse({
      name: "Test",
      parentId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = updateCategorySchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid UUID parentId", () => {
    const result = updateCategorySchema.safeParse({
      name: "Test",
      parentId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("accepts name only (parentId optional)", () => {
    const result = updateCategorySchema.safeParse({ name: "Only name" });
    expect(result.success).toBe(true);
  });
});

describe("createVariantSchema", () => {
  it("accepts valid name", () => {
    const result = createVariantSchema.safeParse({ name: "Talle" });
    expect(result.success).toBe(true);
  });

  it("accepts name with sortOrder", () => {
    const result = createVariantSchema.safeParse({ name: "Talle", sortOrder: 1 });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = createVariantSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing name", () => {
    const result = createVariantSchema.safeParse({ sortOrder: 1 });
    expect(result.success).toBe(false);
  });
});

describe("updateVariantSchema", () => {
  it("accepts name only", () => {
    const result = updateVariantSchema.safeParse({ name: "Tamaño" });
    expect(result.success).toBe(true);
  });

  it("accepts sortOrder only", () => {
    const result = updateVariantSchema.safeParse({ sortOrder: 2 });
    expect(result.success).toBe(true);
  });

  it("accepts empty object (all optional)", () => {
    const result = updateVariantSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = updateVariantSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });
});

describe("createVariantOptionSchema", () => {
  it("accepts valid value", () => {
    const result = createVariantOptionSchema.safeParse({ value: "Grande" });
    expect(result.success).toBe(true);
  });

  it("accepts value with sortOrder", () => {
    const result = createVariantOptionSchema.safeParse({ value: "Grande", sortOrder: 1 });
    expect(result.success).toBe(true);
  });

  it("rejects empty value", () => {
    const result = createVariantOptionSchema.safeParse({ value: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing value", () => {
    const result = createVariantOptionSchema.safeParse({ sortOrder: 1 });
    expect(result.success).toBe(false);
  });
});

describe("updateVariantOptionSchema", () => {
  it("accepts value only", () => {
    const result = updateVariantOptionSchema.safeParse({ value: "Extra Grande" });
    expect(result.success).toBe(true);
  });

  it("accepts sortOrder only", () => {
    const result = updateVariantOptionSchema.safeParse({ sortOrder: 2 });
    expect(result.success).toBe(true);
  });

  it("rejects empty value", () => {
    const result = updateVariantOptionSchema.safeParse({ value: "" });
    expect(result.success).toBe(false);
  });
});

describe("createProductSchema with variantOptionIds", () => {
  const validProduct = {
    name: "Test Product",
    price: 100,
    categoryId: "550e8400-e29b-41d4-a716-446655440000",
    quantity: 10,
  };

  it("accepts product without variantOptionIds (backward compat)", () => {
    const result = createProductSchema.safeParse(validProduct);
    expect(result.success).toBe(true);
  });

  it("accepts product with valid variantOptionIds array", () => {
    const result = createProductSchema.safeParse({
      ...validProduct,
      variantOptionIds: ["550e8400-e29b-41d4-a716-446655440000"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty variantOptionIds array", () => {
    const result = createProductSchema.safeParse({
      ...validProduct,
      variantOptionIds: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects variantOptionIds with non-UUID values", () => {
    const result = createProductSchema.safeParse({
      ...validProduct,
      variantOptionIds: ["not-a-uuid"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects variantOptionIds as non-array", () => {
    const result = createProductSchema.safeParse({
      ...validProduct,
      variantOptionIds: "not-an-array",
    });
    expect(result.success).toBe(false);
  });
});

describe("updateProductSchema with variantOptionIds", () => {
  it("accepts variantOptionIds as optional field", () => {
    const result = updateProductSchema.safeParse({
      variantOptionIds: ["550e8400-e29b-41d4-a716-446655440000"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty object (all optional)", () => {
    const result = updateProductSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

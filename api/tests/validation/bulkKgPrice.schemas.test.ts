import {
  createPriceKgTypeSchema,
  updatePriceKgTypeSchema,
  bulkKgPriceUpdateSchema,
} from "../../src/validation/schemas";

describe("createPriceKgTypeSchema", () => {
  it("accepts name + synonyms and defaults synonyms to []", () => {
    const result = createPriceKgTypeSchema.safeParse({ name: "Adulto" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ name: "Adulto", synonyms: [] });
    }
  });

  it("accepts an explicit synonyms array", () => {
    const result = createPriceKgTypeSchema.safeParse({
      name: "Adulto",
      synonyms: ["ADULTO", "ADULTOS"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.synonyms).toEqual(["ADULTO", "ADULTOS"]);
    }
  });

  it("trims name and synonyms", () => {
    const result = createPriceKgTypeSchema.safeParse({
      name: "  Adulto  ",
      synonyms: ["  ADULTO ", "ADULTOS"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Adulto");
      expect(result.data.synonyms).toEqual(["ADULTO", "ADULTOS"]);
    }
  });

  it("rejects an empty name", () => {
    expect(createPriceKgTypeSchema.safeParse({ name: "" }).success).toBe(false);
    expect(createPriceKgTypeSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("rejects a name over 60 chars", () => {
    expect(createPriceKgTypeSchema.safeParse({ name: "A".repeat(61) }).success).toBe(false);
  });

  it("rejects an empty/whitespace synonym", () => {
    expect(
      createPriceKgTypeSchema.safeParse({ name: "Adulto", synonyms: [""] }).success,
    ).toBe(false);
    expect(
      createPriceKgTypeSchema.safeParse({ name: "Adulto", synonyms: ["  "] }).success,
    ).toBe(false);
  });

  it("rejects more than 50 synonyms", () => {
    const many = Array.from({ length: 51 }, (_, i) => `SYN${i}`);
    expect(createPriceKgTypeSchema.safeParse({ name: "X", synonyms: many }).success).toBe(false);
  });

  it("strips unknown fields", () => {
    const result = createPriceKgTypeSchema.safeParse({ name: "Adulto", extra: "nope" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as any).extra).toBeUndefined();
    }
  });
});

describe("updatePriceKgTypeSchema", () => {
  it("accepts an empty object (all fields optional)", () => {
    const result = updatePriceKgTypeSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({});
    }
  });

  it("accepts a partial update with name only", () => {
    const result = updatePriceKgTypeSchema.safeParse({ name: "Senior" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ name: "Senior" });
    }
  });

  it("accepts a partial update with synonyms only", () => {
    const result = updatePriceKgTypeSchema.safeParse({ synonyms: ["SENIOR"] });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ synonyms: ["SENIOR"] });
    }
  });

  it("rejects an empty name when provided", () => {
    expect(updatePriceKgTypeSchema.safeParse({ name: "" }).success).toBe(false);
  });
});

describe("bulkKgPriceUpdateSchema", () => {
  const validTypeId = "00000000-0000-4000-8000-000000000001";
  const validTypeId2 = "00000000-0000-4000-8000-000000000002";
  const validBrandId = "00000000-0000-4000-8000-000000000003";

  const validPayload = (overrides: Record<string, unknown> = {}) => ({
    brandId: validBrandId,
    entries: [{ typeId: validTypeId, priceKg: 5500 }],
    ...overrides,
  });

  it("accepts a valid payload", () => {
    expect(bulkKgPriceUpdateSchema.safeParse(validPayload()).success).toBe(true);
  });

  it("accepts multiple entries", () => {
    const result = bulkKgPriceUpdateSchema.safeParse(
      validPayload({
        entries: [
          { typeId: validTypeId, priceKg: 5500 },
          { typeId: validTypeId2, priceKg: 3000 },
        ],
      }),
    );
    expect(result.success).toBe(true);
  });

  it("coerces priceKg from a numeric string", () => {
    const result = bulkKgPriceUpdateSchema.safeParse(
      validPayload({ entries: [{ typeId: validTypeId, priceKg: "5500.50" }] }),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.entries[0].priceKg).toBe(5500.5);
    }
  });

  it("rejects a non-uuid brandId", () => {
    const result = bulkKgPriceUpdateSchema.safeParse(
      validPayload({ brandId: "not-a-uuid" }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects a missing brandId field", () => {
    const result = bulkKgPriceUpdateSchema.safeParse({
      entries: [{ typeId: validTypeId, priceKg: 5500 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty entries array", () => {
    const result = bulkKgPriceUpdateSchema.safeParse(validPayload({ entries: [] }));
    expect(result.success).toBe(false);
  });

  it("rejects a missing entries field", () => {
    const result = bulkKgPriceUpdateSchema.safeParse({ brandId: validBrandId });
    expect(result.success).toBe(false);
  });

  it("rejects a duplicate typeId in entries", () => {
    const result = bulkKgPriceUpdateSchema.safeParse(
      validPayload({
        entries: [
          { typeId: validTypeId, priceKg: 5500 },
          { typeId: validTypeId, priceKg: 3000 },
        ],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects a negative priceKg", () => {
    const result = bulkKgPriceUpdateSchema.safeParse(
      validPayload({ entries: [{ typeId: validTypeId, priceKg: -1 }] }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects a zero priceKg (must be positive)", () => {
    const result = bulkKgPriceUpdateSchema.safeParse(
      validPayload({ entries: [{ typeId: validTypeId, priceKg: 0 }] }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects priceKg with more than 2 decimals", () => {
    const result = bulkKgPriceUpdateSchema.safeParse(
      validPayload({ entries: [{ typeId: validTypeId, priceKg: 5500.567 }] }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects a non-uuid typeId", () => {
    const result = bulkKgPriceUpdateSchema.safeParse(
      validPayload({ entries: [{ typeId: "not-a-uuid", priceKg: 5500 }] }),
    );
    expect(result.success).toBe(false);
  });

  it("strips unknown fields", () => {
    const result = bulkKgPriceUpdateSchema.safeParse(validPayload({ extra: "nope" }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as any).extra).toBeUndefined();
    }
  });
});

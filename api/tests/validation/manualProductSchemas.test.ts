import {
  createManualProductSchema,
  promoteManualProductSchema,
} from "../../src/validation/schemas";

describe("createManualProductSchema", () => {
  it("acepta nombre + precio > 0 y recorta el nombre", () => {
    const r = createManualProductSchema.safeParse({ name: "  Correa  ", price: 1500 });
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ name: "Correa", price: 1500 });
  });

  it("coerciona precio en string", () => {
    const r = createManualProductSchema.safeParse({ name: "Correa", price: "99.5" });
    expect(r.success).toBe(true);
    expect(r.data!.price).toBe(99.5);
  });

  it("rechaza nombre vacío o solo espacios", () => {
    expect(createManualProductSchema.safeParse({ name: "", price: 10 }).success).toBe(false);
    expect(createManualProductSchema.safeParse({ name: "   ", price: 10 }).success).toBe(false);
  });

  it("rechaza precio 0, negativo o ausente", () => {
    expect(createManualProductSchema.safeParse({ name: "A", price: 0 }).success).toBe(false);
    expect(createManualProductSchema.safeParse({ name: "A", price: -5 }).success).toBe(false);
    expect(createManualProductSchema.safeParse({ name: "A" }).success).toBe(false);
  });

  it("descarta campos desconocidos (no permite setear isManual/quantity desde el body)", () => {
    const r = createManualProductSchema.safeParse({
      name: "A",
      price: 1,
      isManual: false,
      quantity: 99,
      publishedToStore: true,
    });
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ name: "A", price: 1 });
  });
});

describe("promoteManualProductSchema", () => {
  it("acepta categoryId no vacío", () => {
    expect(promoteManualProductSchema.safeParse({ categoryId: "cat-1" }).success).toBe(true);
  });

  it("rechaza categoryId vacío o ausente", () => {
    expect(promoteManualProductSchema.safeParse({ categoryId: "" }).success).toBe(false);
    expect(promoteManualProductSchema.safeParse({}).success).toBe(false);
  });
});

/**
 * Zod schema tests para POR_UNIDAD + unitsPerBox (sdd/venta-por-unidad-multpack,
 * tasks 2.2/2.3/2.6). Sin DB. En un archivo aparte para no mezclarse con el
 * suite de schemas genérico (que ya tiene fallas pre-existentes).
 */
import {
  createProductSchema,
  updateProductSchema,
  createSaleSchema,
} from "../schemas";

describe("createProductSchema unitsPerBox", () => {
  const base = {
    name: "Multi-pack 15x85grs",
    price: 18400,
    categoryId: "cat-1",
    quantity: 10,
  };

  it("acepta unitsPerBox entero positivo", () => {
    const result = createProductSchema.safeParse({ ...base, unitsPerBox: 15 });
    expect(result.success).toBe(true);
  });

  it("omite unitsPerBox (ausente = producto box-only legacy)", () => {
    const result = createProductSchema.safeParse(base);
    expect(result.success).toBe(true);
    expect(result.data?.unitsPerBox).toBeUndefined();
  });

  it("rechaza unitsPerBox negativo", () => {
    const result = createProductSchema.safeParse({ ...base, unitsPerBox: -1 });
    expect(result.success).toBe(false);
  });

  it("rechaza unitsPerBox no entero (decimal)", () => {
    const result = createProductSchema.safeParse({ ...base, unitsPerBox: 15.5 });
    expect(result.success).toBe(false);
  });
});

describe("updateProductSchema unitsPerBox", () => {
  it("acepta unitsPerBox entero positivo (edición)", () => {
    const result = updateProductSchema.safeParse({ unitsPerBox: 15 });
    expect(result.success).toBe(true);
  });

  it("acepta unitsPerBox null (limpiar el valor → box-only)", () => {
    const result = updateProductSchema.safeParse({ unitsPerBox: null });
    expect(result.success).toBe(true);
    expect(result.data?.unitsPerBox).toBeNull();
  });

  it("rechaza unitsPerBox negativo en edición", () => {
    const result = updateProductSchema.safeParse({ unitsPerBox: -2 });
    expect(result.success).toBe(false);
  });
});

describe("createSaleSchema saleMode POR_UNIDAD", () => {
  const unitLine = {
    productId: "p-1",
    quantity: 3,
    price: 1226.67,
    category: "Balanceados",
    saleMode: "POR_UNIDAD",
  };

  it("acepta una línea POR_UNIDAD con productId y cantidad entera", () => {
    const result = createSaleSchema.safeParse({ products: [unitLine] });
    expect(result.success).toBe(true);
  });

  it("rechaza POR_UNIDAD sin productId", () => {
    const result = createSaleSchema.safeParse({
      products: [{ ...unitLine, productId: undefined }],
    });
    expect(result.success).toBe(false);
  });

  it("rechaza POR_UNIDAD con cantidad no entera", () => {
    const result = createSaleSchema.safeParse({
      products: [{ ...unitLine, quantity: 2.5 }],
    });
    expect(result.success).toBe(false);
  });

  it("BOLSA_CERRADA sigue aceptando cantidad entera (regresión)", () => {
    const result = createSaleSchema.safeParse({
      products: [{ productId: "p-1", quantity: 2, price: 100, category: "x", saleMode: "BOLSA_CERRADA" }],
    });
    expect(result.success).toBe(true);
  });

  it("saleMode POR_UNIDAD es un valor válido del enum (default legacy sigue BOLSA_CERRADA)", () => {
    const legacy = createSaleSchema.safeParse({
      products: [{ productId: "p-1", quantity: 1, price: 100, category: "x" }],
    });
    expect(legacy.success).toBe(true);
    expect(legacy.data?.products[0].saleMode).toBe("BOLSA_CERRADA");
  });
});

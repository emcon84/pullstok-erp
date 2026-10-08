import { describe, it, expect } from "vitest";
import {
  aggregateSalesByCategory,
  aggregateTopProducts,
  SIN_CATEGORIA,
  LOOSE_CATEGORY,
  OTRAS_CATEGORIAS,
} from "../utils/salesAggregations";
import type { Sale } from "../models/salesModel";

type Item = NonNullable<Sale["items"]>[number];

const item = (o: Partial<Item> & { name: string; quantity: number; price: number }): Item => ({
  category: "Alimento",
  productId: "p-" + o.name,
  ...o,
});
const sale = (items: Item[], extra: Partial<Sale> = {}): Sale => ({
  totalAmount: 0,
  saleDate: "2026-09-20T10:00:00",
  items,
  ...extra,
});

describe("aggregateSalesByCategory", () => {
  it("devuelve [] sin ventas o sin renglones", () => {
    expect(aggregateSalesByCategory([])).toEqual([]);
    expect(aggregateSalesByCategory([sale([]), { totalAmount: 5, saleDate: "x" } as Sale])).toEqual([]);
  });

  it("suma monto (cantidad × precio) y cantidad por categoría, ordenado por monto desc", () => {
    const rows = aggregateSalesByCategory([
      sale([
        item({ name: "A", quantity: 2, price: 100, category: "Perros" }),
        item({ name: "B", quantity: 1, price: 500, category: "Gatos" }),
      ]),
      sale([item({ name: "C", quantity: 3, price: 50, category: "Perros" })]),
    ]);
    expect(rows).toEqual([
      { label: "Gatos", amount: 500, quantity: 1 },
      { label: "Perros", amount: 350, quantity: 5 },
    ]);
  });

  it("categoría vacía o ausente -> 'Sin categoría' (con trim)", () => {
    const rows = aggregateSalesByCategory([
      sale([
        item({ name: "A", quantity: 1, price: 10, category: "" }),
        item({ name: "B", quantity: 1, price: 10, category: "   " }),
        item({ name: "C", quantity: 1, price: 10, category: undefined as unknown as string }),
        item({ name: "D", quantity: 1, price: 10, category: " Perros " }),
      ]),
    ]);
    expect(rows).toContainEqual({ label: SIN_CATEGORIA, amount: 30, quantity: 3 });
    expect(rows).toContainEqual({ label: "Perros", amount: 10, quantity: 1 });
  });

  it("renglón suelto sin categoría -> LOOSE_CATEGORY con unit kg; el resto sigue en 'Sin categoría'", () => {
    const rows = aggregateSalesByCategory([
      sale([
        item({ name: "Granel", quantity: 1.5, price: 100, category: "", productId: null, loosePriceId: "lp1", saleMode: "POR_PESO" }),
        item({ name: "Granel2", quantity: 0.25, price: 100, category: "", productId: null, saleMode: "POR_PESO", loosePriceId: undefined }),
        item({ name: "Otro", quantity: 1, price: 10, category: "" }),
      ]),
    ]);
    expect(LOOSE_CATEGORY).toBe("Alimento suelto (por peso)");
    expect(rows).toContainEqual({ label: LOOSE_CATEGORY, amount: 175, quantity: 1.75, unit: "kg" });
    expect(rows).toContainEqual({ label: SIN_CATEGORIA, amount: 10, quantity: 1 });
  });

  it("producto suelto en el top lleva unit kg", () => {
    const rows = aggregateTopProducts([
      sale([item({ name: "Granel", quantity: 2, price: 100, category: "", productId: null, loosePriceId: "lp1", saleMode: "POR_PESO" })]),
    ]);
    expect(rows).toEqual([{ label: "Granel", amount: 200, quantity: 2, unit: "kg" }]);
  });

  it("redondea con round2 el monto del renglón (kg × precio suelto)", () => {
    const rows = aggregateSalesByCategory([
      sale([item({ name: "Suelto", quantity: 0.333, price: 100, saleMode: "POR_PESO" })]),
    ]);
    expect(rows).toEqual([{ label: "Alimento", amount: 33.3, quantity: 0.333, unit: "kg" }]);
  });

  it("descarta filas con monto <= 0", () => {
    const rows = aggregateSalesByCategory([
      sale([
        item({ name: "A", quantity: 0, price: 100, category: "Cero" }),
        item({ name: "B", quantity: 1, price: 0, category: "Gratis" }),
        item({ name: "C", quantity: 1, price: 10, category: "Ok" }),
      ]),
    ]);
    expect(rows.map((r) => r.label)).toEqual(["Ok"]);
  });

  it("top 8 + 'Otras' agrupa el resto (al final, con monto y cantidad sumados)", () => {
    const items = Array.from({ length: 11 }, (_, i) =>
      item({ name: `P${i}`, quantity: 1, price: (11 - i) * 100, category: `Cat${i}` }),
    );
    const rows = aggregateSalesByCategory([sale(items)]);
    expect(rows).toHaveLength(9);
    expect(rows.slice(0, 8).map((r) => r.label)).toEqual(
      Array.from({ length: 8 }, (_, i) => `Cat${i}`),
    );
    // Cat8=300, Cat9=200, Cat10=100
    expect(rows[8]).toEqual({ label: OTRAS_CATEGORIAS, amount: 600, quantity: 3 });
  });

  it("con 9 categorías exactas no agrupa distinto: 8 + Otras(1)", () => {
    const items = Array.from({ length: 9 }, (_, i) =>
      item({ name: `P${i}`, quantity: 1, price: 100 - i, category: `Cat${i}` }),
    );
    const rows = aggregateSalesByCategory([sale(items)]);
    expect(rows).toHaveLength(9);
    expect(rows[8].label).toBe(OTRAS_CATEGORIAS);
  });

  it("con 8 categorías o menos no crea 'Otras'", () => {
    const items = Array.from({ length: 8 }, (_, i) =>
      item({ name: `P${i}`, quantity: 1, price: 10 + i, category: `Cat${i}` }),
    );
    const rows = aggregateSalesByCategory([sale(items)]);
    expect(rows).toHaveLength(8);
    expect(rows.some((r) => r.label === OTRAS_CATEGORIAS)).toBe(false);
  });

  it("desempata por etiqueta de forma estable", () => {
    const rows = aggregateSalesByCategory([
      sale([
        item({ name: "A", quantity: 1, price: 100, category: "Zeta" }),
        item({ name: "B", quantity: 1, price: 100, category: "Alfa" }),
      ]),
    ]);
    expect(rows.map((r) => r.label)).toEqual(["Alfa", "Zeta"]);
  });

  it("no resta descuento/recargo a nivel venta", () => {
    const rows = aggregateSalesByCategory([
      sale([item({ name: "A", quantity: 1, price: 1000 })], { discount: 500, surcharge: 100 }),
    ]);
    expect(rows[0].amount).toBe(1000);
  });

  it("ventas legacy con `products` (sin items) cuentan como 'Sin categoría'", () => {
    const rows = aggregateSalesByCategory([
      { totalAmount: 90, saleDate: "x", products: [{ name: "Viejo", quantity: 3, price: 30 }] } as Sale,
    ]);
    expect(rows).toEqual([{ label: SIN_CATEGORIA, amount: 90, quantity: 3 }]);
  });
});

describe("aggregateTopProducts", () => {
  it("devuelve [] con entrada vacía", () => {
    expect(aggregateTopProducts([])).toEqual([]);
  });

  it("agrupa por productId entre ventas y ordena por MONTO, no por cantidad", () => {
    const rows = aggregateTopProducts([
      sale([
        item({ name: "Barato", productId: "1", quantity: 100, price: 10 }), // 1000
        item({ name: "Caro", productId: "2", quantity: 1, price: 5000 }), // 5000
      ]),
      sale([item({ name: "Barato", productId: "1", quantity: 50, price: 10 })]), // +500
    ]);
    expect(rows).toEqual([
      { label: "Caro", amount: 5000, quantity: 1 },
      { label: "Barato", amount: 1500, quantity: 150 },
    ]);
  });

  it("líneas sueltas (sin productId) agrupan por loosePriceId; luego por nombre", () => {
    const rows = aggregateTopProducts([
      sale([
        item({ name: "Suelto X", productId: "", loosePriceId: "L1", quantity: 2, price: 100, saleMode: "POR_PESO" }),
        item({ name: "Suelto X", productId: "", loosePriceId: "L1", quantity: 1, price: 100, saleMode: "POR_PESO" }),
        item({ name: "Manual", productId: "", quantity: 1, price: 40 }),
        item({ name: "Manual", productId: "", quantity: 1, price: 40 }),
      ]),
    ]);
    expect(rows).toEqual([
      { label: "Suelto X", amount: 300, quantity: 3, unit: "kg" },
      { label: "Manual", amount: 80, quantity: 2 },
    ]);
  });

  it("se queda con los 10 primeros y descarta monto <= 0", () => {
    const items = Array.from({ length: 12 }, (_, i) =>
      item({ name: `P${i}`, quantity: 1, price: 1000 - i * 10 }),
    );
    items.push(item({ name: "Cero", quantity: 5, price: 0 }));
    const rows = aggregateTopProducts([sale(items)]);
    expect(rows).toHaveLength(10);
    expect(rows[0].label).toBe("P0");
    expect(rows.some((r) => r.label === "Cero")).toBe(false);
  });

  it("desempata por etiqueta y respeta un límite personalizado", () => {
    const rows = aggregateTopProducts(
      [
        sale([
          item({ name: "Zeta", quantity: 1, price: 100 }),
          item({ name: "Alfa", quantity: 1, price: 100 }),
          item({ name: "Beta", quantity: 1, price: 50 }),
        ]),
      ],
      2,
    );
    expect(rows.map((r) => r.label)).toEqual(["Alfa", "Zeta"]);
  });

  it("ventas legacy con `products` se agrupan por nombre", () => {
    const rows = aggregateTopProducts([
      { totalAmount: 0, saleDate: "x", products: [{ name: "Viejo", quantity: 3, price: 30 }] } as Sale,
    ]);
    expect(rows).toEqual([{ label: "Viejo", amount: 90, quantity: 3 }]);
  });
});

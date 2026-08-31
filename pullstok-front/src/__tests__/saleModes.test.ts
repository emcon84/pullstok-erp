import { describe, it, expect } from "vitest";
import type { Sale } from "../models/salesModel";
import {
  isLooseSale,
  isUnitSale,
  saleModeLabel,
} from "../models/saleModeHelpers";

// sdd/venta-por-unidad-multpack — clasificación de ventas por modo de renglón.
// POR_UNIDAD es una venta FÍSICA por unidad: NO es "suelta" (isLooseSale no la
// marca), y se etiqueta/filtra por separado ("Por unidad").
describe("isLooseSale — POR_UNIDAD NO es una venta suelta", () => {
  it("una venta con renglón POR_UNIDAD NO es suelta (isLooseSale false)", () => {
    const sale: Sale = {
      saleDate: "2026-08-31",
      totalAmount: 0,
      items: [
        {
          productId: "p1",
          name: "FELIX 15x85grs",
          quantity: 3,
          price: 1226.67,
          category: "",
          saleMode: "POR_UNIDAD",
        },
      ],
    };
    expect(isLooseSale(sale)).toBe(false);
  });

  it("una venta con renglón POR_PESO o POR_MONTO SÍ es suelta", () => {
    const looseKg: Sale = {
      saleDate: "2026-08-31",
      totalAmount: 0,
      items: [
        {
          productId: "p1",
          name: "ACME",
          quantity: 2.5,
          price: 360,
          category: "",
          saleMode: "POR_PESO",
        },
      ],
    };
    const looseAmt: Sale = {
      saleDate: "2026-08-31",
      totalAmount: 0,
      items: [
        {
          productId: "p1",
          name: "ACME",
          quantity: 1,
          price: 1000,
          category: "",
          saleMode: "POR_MONTO",
        },
      ],
    };
    expect(isLooseSale(looseKg)).toBe(true);
    expect(isLooseSale(looseAmt)).toBe(true);
  });

  it("una venta mixta caja + por unidad NO es suelta (ningún modo suelto)", () => {
    const sale: Sale = {
      saleDate: "2026-08-31",
      totalAmount: 0,
      items: [
        { productId: "p1", name: "A", quantity: 1, price: 18400, category: "", saleMode: "BOLSA_CERRADA" },
        { productId: "p1", name: "A", quantity: 3, price: 1226.67, category: "", saleMode: "POR_UNIDAD" },
      ],
    };
    expect(isLooseSale(sale)).toBe(false);
  });
});

describe("isUnitSale — detecta ventas con renglón por unidad", () => {
  it("true cuando hay un renglón POR_UNIDAD", () => {
    const sale: Sale = {
      saleDate: "2026-08-31",
      totalAmount: 0,
      items: [
        { productId: "p1", name: "A", quantity: 3, price: 1226.67, category: "", saleMode: "POR_UNIDAD" },
      ],
    };
    expect(isUnitSale(sale)).toBe(true);
  });

  it("false cuando no hay renglón POR_UNIDAD", () => {
    const sale: Sale = {
      saleDate: "2026-08-31",
      totalAmount: 0,
      items: [
        { productId: "p1", name: "A", quantity: 1, price: 18400, category: "", saleMode: "BOLSA_CERRADA" },
      ],
    };
    expect(isUnitSale(sale)).toBe(false);
  });
});

describe("saleModeLabel — etiqueta legible por modo", () => {
  it("mapea cada modo a su etiqueta", () => {
    expect(saleModeLabel("POR_UNIDAD")).toBe("Por unidad");
    expect(saleModeLabel("BOLSA_CERRADA")).toBe("Caja");
    expect(saleModeLabel("POR_PESO")).toBe("Suelto (kg)");
    expect(saleModeLabel("POR_MONTO")).toBe("Suelto ($)");
  });

  it("modo ausente/desconocido cae a Caja", () => {
    expect(saleModeLabel(undefined)).toBe("Caja");
    expect(saleModeLabel("DESCONOCIDO" as never)).toBe("Caja");
  });
});

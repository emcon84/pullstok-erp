import { describe, it, expect } from "vitest";
import type { DataItem } from "../types";
import {
  isUnitSellable,
  unitPrice,
  boxCountFromUnits,
  stockLabel,
  saleModeForProduct,
} from "../components/hooks/vendorCatalogHelpers";

// sdd/venta-por-unidad-multpack — helpers del catálogo del vendor para venta
// por unidad (POR_UNIDAD). Productos elegibles (unitsPerBox > 1) pueden
// venderse por caja (BOLSA_CERRADA) o por unidad; el resto solo por caja.
describe("isUnitSellable — elegibilidad de unit-sale", () => {
  it("null/undefined → NO vendible por unidad", () => {
    expect(isUnitSellable(null)).toBe(false);
    expect(isUnitSellable(undefined)).toBe(false);
  });

  it("1 o 0 → NO vendible por unidad (multipack debe ser > 1)", () => {
    expect(isUnitSellable(1)).toBe(false);
    expect(isUnitSellable(0)).toBe(false);
  });

  it("> 1 → vendible por unidad (rebaja `unitsPerBox` correcto)", () => {
    expect(isUnitSellable(15)).toBe(true);
    expect(isUnitSellable(24)).toBe(true);
  });
});

describe("unitPrice — precio unitario de un multipack", () => {
  it("usa el perUnitPrice que calcula el backend cuando viene", () => {
    const p: DataItem = {
      name: "FELIX POUCH PESC X 15x85grs",
      price: 18400,
      quantity: 0,
      unitsPerBox: 15,
      perUnitPrice: 1226.67,
    };
    expect(unitPrice(p)).toBeCloseTo(1226.67, 2);
  });

  it("redondea hacia arriba al próximo $100 cuando el perUnitPrice no viene: 18400 ÷ 15 → 1300", () => {
    const p: DataItem = { name: "X 15x85grs", price: 18400, quantity: 0, unitsPerBox: 15 };
    expect(unitPrice(p)).toBe(1300);
  });

  it("producto no elegible → null (no hay precio por unidad)", () => {
    const p: DataItem = { name: "Bolsa simple", price: 4500, quantity: 0, unitsPerBox: null };
    expect(unitPrice(p)).toBeNull();
  });

  it("sin unitsPerBox y sin perUnitPrice → null", () => {
    const p: DataItem = { name: "Sin datos", price: 1200, quantity: 0 };
    expect(unitPrice(p)).toBeNull();
  });
});

describe("boxCountFromUnits — conversión stock unidades → cajas", () => {
  it("150 unidades con 15 por caja → 10 cajas", () => {
    expect(boxCountFromUnits(150, 15)).toBe(10);
  });

  it("140 unidades con 15 por caja → 9 cajas (piso)", () => {
    expect(boxCountFromUnits(140, 15)).toBe(9);
  });

  it("menos de una caja → 0 cajas", () => {
    expect(boxCountFromUnits(10, 15)).toBe(0);
  });
});

describe("stockLabel — etiqueta de stock según el modo (switch global)", () => {
  const eligible: DataItem = {
    name: "X 15x85grs",
    price: 18400,
    quantity: 0,
    unitsPerBox: 15,
    stocks: [{ quantity: 150 }],
  };

  it("unitMode OFF + elegible → cantidad en cajas", () => {
    expect(stockLabel(eligible, false)).toBe("10 cajas");
  });

  it("unitMode ON + elegible → cantidad en unidades", () => {
    expect(stockLabel(eligible, true)).toBe("150 u.");
  });

  it("no elegible (unitsPerBox <= 1) → siempre en unidades", () => {
    const plain: DataItem = {
      name: "Bolsa simple",
      price: 4500,
      quantity: 0,
      unitsPerBox: 1,
      stocks: [{ quantity: 20 }],
    };
    expect(stockLabel(plain, false)).toBe("20 u.");
    expect(stockLabel(plain, true)).toBe("20 u.");
  });

  it("sin unitsPerBox → sin conversión a cajas", () => {
    const p: DataItem = { name: "Sin datos", price: 5, quantity: 0, stocks: [{ quantity: 7 }] };
    expect(stockLabel(p, false)).toBe("7 u.");
    expect(stockLabel(p, true)).toBe("7 u.");
  });
});

describe("saleModeForProduct — modo según el switch global 'Vender por unidad'", () => {
  const eligible: DataItem = {
    name: "X 15x85grs",
    price: 18400,
    quantity: 0,
    unitsPerBox: 15,
  };
  const plain: DataItem = { name: "Bolsa", price: 4500, quantity: 0, unitsPerBox: 1 };

  it("unitMode ON + elegible → POR_UNIDAD", () => {
    expect(saleModeForProduct(eligible, true)).toBe("POR_UNIDAD");
  });

  it("unitMode OFF + elegible → BOLSA_CERRADA", () => {
    expect(saleModeForProduct(eligible, false)).toBe("BOLSA_CERRADA");
  });

  it("unitMode ON + no elegible → BOLSA_CERRADA", () => {
    expect(saleModeForProduct(plain, true)).toBe("BOLSA_CERRADA");
  });

  it("unitMode OFF + no elegible → BOLSA_CERRADA", () => {
    expect(saleModeForProduct(plain, false)).toBe("BOLSA_CERRADA");
  });
});

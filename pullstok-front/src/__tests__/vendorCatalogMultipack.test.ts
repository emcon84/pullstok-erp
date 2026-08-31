import { describe, it, expect } from "vitest";
import type { DataItem } from "../types";
import {
  isUnitSellable,
  unitPrice,
  boxCountFromUnits,
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

  it("deriva round2(price / unitsPerBox) cuando el perUnitPrice no viene", () => {
    const p: DataItem = { name: "X 15x85grs", price: 18400, quantity: 0, unitsPerBox: 15 };
    expect(unitPrice(p)).toBeCloseTo(1226.67, 2);
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

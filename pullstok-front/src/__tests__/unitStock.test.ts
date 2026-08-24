import { describe, it, expect } from "vitest";
import { unitStock, branchQty, stockUnitLabel } from "../components/hooks/vendorCatalogHelpers";
import type { DataItem } from "../types";

// El stock de bolsa cerrada SIEMPRE se muestra en unidades (bolsas). La fuente
// autoritativa es ProductStock (`stocks[0].quantity`, ya en unidades); la
// columna legacy `quantity` está en KG y solo se usa como fallback, convertida.
describe("unitStock — stock de bolsa en unidades", () => {
  it("usa ProductStock (unidades) cuando la sucursal tiene stock, sin dividir", () => {
    // Ej. del enunciado: producto "… X 15 KG" con 99 bolsas en la sucursal.
    const p: DataItem = {
      name: "PURINA 15KG",
      price: 0,
      quantity: 1500, // kg legacy
      weightKg: 15,
      stocks: [{ quantity: 99 }],
    };
    expect(unitStock(p)).toBe(99);
  });

  it("con una fila de stock en 0 usa 0 (real de la sucursal), no el legacy", () => {
    const p: DataItem = {
      name: "PURINA 15KG",
      price: 0,
      quantity: 1500, // kg legacy
      weightKg: 15,
      stocks: [{ quantity: 0 }],
    };
    expect(unitStock(p)).toBe(0);
  });

  it("sin stock de sucursal convierte el legacy en bolsas: round(quantity / weightKg)", () => {
    const p: DataItem = {
      name: "PURINA 15KG",
      price: 0,
      quantity: 1500,
      weightKg: 15,
    };
    expect(unitStock(p)).toBe(100);
  });

  it("si falta weightKg divide por 1 (no rompe; queda como esté)", () => {
    const p: DataItem = { name: "X", price: 0, quantity: 1500 };
    expect(unitStock(p)).toBe(1500);
  });

  it("redondea el resultado (nunca muestra bolsas fraccionarias)", () => {
    const p: DataItem = { name: "X", price: 0, quantity: 100, weightKg: 15 };
    expect(unitStock(p)).toBe(7); // Math.round(6.66)
  });

  it("no toca el flujo suelto: suelto con stock de sucursal devuelve unidades", () => {
    // Un producto vendible suelto (priceKgSuelto>0) sigue siendo una bolsa
    // física en el contexto BOLSA_CERRADA: su stock es ProductStock (unidades).
    const p: DataItem = {
      name: "PURINA 15KG",
      price: 0,
      quantity: 1500,
      weightKg: 15,
      priceKgSuelto: 9200,
      stocks: [{ quantity: 99 }],
    };
    expect(unitStock(p)).toBe(99);
  });
});

describe("helpers de stock relacionados", () => {
  it("stockUnitLabel devuelve 'u.' para bolsa", () => {
    expect(stockUnitLabel({ name: "X" } as DataItem)).toBe("u.");
  });

  it("branchQty se mantiene como acceso a ProductStock (unidades)", () => {
    const p: DataItem = { name: "X", price: 0, quantity: 0, stocks: [{ quantity: 42 }] };
    expect(branchQty(p)).toBe(42);
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useVendorCart } from "../components/hooks/useVendorCart";
import type { DataItem } from "../types";

// sdd/venta-por-unidad-multpack — carrito del POS: un mismo multipack puede
// entrar como línea de CAJA (BOLSA_CERRADA, usa product.price) o como línea
// POR UNIDAD (POR_UNIDAD, usa perUnitPrice). Deben ser líneas SEPARADAS y el
// total suma caja×price + unidades×perUnitPrice.
const eligible: DataItem = {
  _id: "p-multipack",
  name: "FELIX POUCH PESC X 15x85grs",
  code: "F-15",
  price: 18400,
  quantity: 0,
  unitsPerBox: 15,
  perUnitPrice: 1226.67,
};

const plain: DataItem = {
  _id: "p-plain",
  name: "Bolsa simple",
  code: "S-1",
  price: 4500,
  quantity: 0,
};

describe("useVendorCart — dual-line box + por unidad", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("same product box + unit = 2 distinct lines with different saleMode", () => {
    const { result } = renderHook(() => useVendorCart());
    act(() => result.current.addToCart(eligible, 1, "b1", 150, "BOLSA_CERRADA"));
    act(() => result.current.addToCart(eligible, 3, "b1", 150, "POR_UNIDAD"));

    expect(result.current.items).toHaveLength(2);
    expect(result.current.items[0].saleMode).toBe("BOLSA_CERRADA");
    expect(result.current.items[0].price).toBe(18400);
    expect(result.current.items[1].saleMode).toBe("POR_UNIDAD");
    expect(result.current.items[1].price).toBeCloseTo(1226.67, 2);
    expect(result.current.items[1].perUnitPrice).toBeCloseTo(1226.67, 2);
    expect(result.current.items[1].unitsPerBox).toBe(15);
  });

  it("merges two POR_UNIDAD addToCart of the same product (same line)", () => {
    const { result } = renderHook(() => useVendorCart());
    act(() => result.current.addToCart(eligible, 2, "b1", 150, "POR_UNIDAD"));
    act(() => result.current.addToCart(eligible, 3, "b1", 150, "POR_UNIDAD"));

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].saleMode).toBe("POR_UNIDAD");
    expect(result.current.items[0].quantity).toBe(5);
  });

  it("cart total = box(price×boxes) + unit(perUnitPrice×units)", () => {
    const { result } = renderHook(() => useVendorCart());
    act(() => result.current.addToCart(eligible, 1, "b1", 150, "BOLSA_CERRADA"));
    act(() => result.current.addToCart(eligible, 3, "b1", 150, "POR_UNIDAD"));

    const expected = 1 * 18400 + 3 * 1226.67;
    expect(result.current.totalAmount).toBeCloseTo(expected, 2);
  });

  it("box line keeps product.price (never perUnitPrice)", () => {
    const { result } = renderHook(() => useVendorCart());
    act(() => result.current.addToCart(eligible, 2, "b1", 150, "BOLSA_CERRADA"));

    expect(result.current.items[0].saleMode).toBe("BOLSA_CERRADA");
    expect(result.current.items[0].price).toBe(18400);
  });

  it("non-eligible product (no unitsPerBox) keeps current box-only behavior", () => {
    const { result } = renderHook(() => useVendorCart());
    act(() => result.current.addToCart(plain, 2, "b1", 20, "BOLSA_CERRADA"));

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].saleMode).toBe("BOLSA_CERRADA");
    expect(result.current.items[0].price).toBe(4500);
  });
});

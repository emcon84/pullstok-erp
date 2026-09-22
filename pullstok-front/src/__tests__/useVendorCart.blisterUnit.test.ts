import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useVendorCart } from "../components/hooks/useVendorCart";
import type { DataItem } from "../types";

// sdd/venta-pastillas-sueltas-blister — carrito del POS: pastillas sueltas de
// un blister de FARMACIA. A diferencia de POR_UNIDAD (multipack con
// unitsPerBox persistido), acá el conteo (piecesPerBlister) es AD-HOC, lo
// carga el vendedor al momento de la venta y viaja como argumento de
// addToCart en vez de leerse de product.unitsPerBox.
const blisterProduct: DataItem = {
  _id: "p-blister",
  name: "IBUPROFENO 400 X BLISTER",
  code: "F-1",
  price: 4500,
  quantity: 0,
  category: "FARMACIA",
  // Sin unitsPerBox: no es un multipack de catálogo.
};

describe("useVendorCart — POR_UNIDAD_BLISTER (venta-pastillas-sueltas-blister)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("computes the line price from piecesPerBlister (ceil to $100), not from product.unitsPerBox", () => {
    const { result } = renderHook(() => useVendorCart());
    act(() =>
      result.current.addToCart(
        blisterProduct,
        4, // 4 pastillas
        "b1",
        20,
        "POR_UNIDAD_BLISTER",
        undefined,
        undefined,
        undefined,
        false,
        7, // piecesPerBlister
      ),
    );

    expect(result.current.items).toHaveLength(1);
    const item = result.current.items[0];
    expect(item.saleMode).toBe("POR_UNIDAD_BLISTER");
    expect(item.quantity).toBe(4);
    // ceil(4500/7 a $100) = ceil(642.857/100)*100 = 700.
    expect(item.price).toBe(700);
    expect(item.piecesPerBlister).toBe(7);
  });

  it("cart total = price-per-piece × pieces sold", () => {
    const { result } = renderHook(() => useVendorCart());
    act(() =>
      result.current.addToCart(
        blisterProduct,
        4,
        "b1",
        20,
        "POR_UNIDAD_BLISTER",
        undefined,
        undefined,
        undefined,
        false,
        7,
      ),
    );

    expect(result.current.totalAmount).toBe(700 * 4);
  });

  it("merges two addToCart calls with the SAME piecesPerBlister into one line", () => {
    const { result } = renderHook(() => useVendorCart());
    act(() =>
      result.current.addToCart(
        blisterProduct,
        2,
        "b1",
        20,
        "POR_UNIDAD_BLISTER",
        undefined,
        undefined,
        undefined,
        false,
        7,
      ),
    );
    act(() =>
      result.current.addToCart(
        blisterProduct,
        3,
        "b1",
        20,
        "POR_UNIDAD_BLISTER",
        undefined,
        undefined,
        undefined,
        false,
        7,
      ),
    );

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].quantity).toBe(5);
  });

  it("keeps DIFFERENT piecesPerBlister as separate lines (each blister scan has its own count)", () => {
    const { result } = renderHook(() => useVendorCart());
    act(() =>
      result.current.addToCart(
        blisterProduct,
        2,
        "b1",
        20,
        "POR_UNIDAD_BLISTER",
        undefined,
        undefined,
        undefined,
        false,
        7,
      ),
    );
    act(() =>
      result.current.addToCart(
        blisterProduct,
        3,
        "b1",
        20,
        "POR_UNIDAD_BLISTER",
        undefined,
        undefined,
        undefined,
        false,
        10, // blister distinto, distinto conteo
      ),
    );

    expect(result.current.items).toHaveLength(2);
    expect(result.current.items[0].piecesPerBlister).toBe(7);
    expect(result.current.items[1].piecesPerBlister).toBe(10);
  });

  it("BOLSA_CERRADA line for the same product stays a separate line from POR_UNIDAD_BLISTER", () => {
    const { result } = renderHook(() => useVendorCart());
    act(() => result.current.addToCart(blisterProduct, 1, "b1", 20, "BOLSA_CERRADA"));
    act(() =>
      result.current.addToCart(
        blisterProduct,
        4,
        "b1",
        20,
        "POR_UNIDAD_BLISTER",
        undefined,
        undefined,
        undefined,
        false,
        7,
      ),
    );

    expect(result.current.items).toHaveLength(2);
    expect(result.current.items[0].saleMode).toBe("BOLSA_CERRADA");
    expect(result.current.items[0].price).toBe(4500);
    expect(result.current.items[1].saleMode).toBe("POR_UNIDAD_BLISTER");
  });
});

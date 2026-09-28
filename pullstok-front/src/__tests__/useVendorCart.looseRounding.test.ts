import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useVendorCart } from "../components/hooks/useVendorCart";
import type { DataItem } from "../types";

// Loose (POR_PESO / POR_MONTO) quantities are ALWAYS rounded to 2 decimals in
// the cart so the ticket, totals and the payload the server validates agree.
// BOLSA_CERRADA / POR_UNIDAD keep their integer behavior untouched.
const product: DataItem = {
  _id: "p-1",
  name: "PRO PLAN",
  code: "C-1",
  price: 10000,
  priceKgSuelto: 9200,
  quantity: 0,
  category: "",
};

describe("useVendorCart — loose quantity rounding (2dp)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("addToCart rounds a 3-decimal scale weight half-up (0.285 -> 0.29)", () => {
    const { result } = renderHook(() => useVendorCart());
    act(() => result.current.addToCart(product, 0.285, "b1", 0, "POR_PESO", 9200, "c1"));
    expect(result.current.items[0].quantity).toBe(0.29);
  });

  it("addToCart rounds POR_MONTO amounts too", () => {
    const { result } = renderHook(() => useVendorCart());
    act(() => result.current.addToCart(product, 1234.567, "b1", 0, "POR_MONTO", 9200, "c1"));
    expect(result.current.items[0].quantity).toBe(1234.57);
  });

  it("merge does not accumulate float drift (0.1 + 0.2 -> 0.3)", () => {
    const { result } = renderHook(() => useVendorCart());
    act(() => result.current.addToCart(product, 0.1, "b1", 0, "POR_PESO", 9200, "c1"));
    act(() => result.current.addToCart(product, 0.2, "b1", 0, "POR_PESO", 9200, "c1"));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].quantity).toBe(0.3);
  });

  it("a loose quantity that rounds to 0 does not create a line", () => {
    const { result } = renderHook(() => useVendorCart());
    act(() => result.current.addToCart(product, 0.004, "b1", 0, "POR_PESO", 9200, "c1"));
    expect(result.current.items).toHaveLength(0);
  });

  it("updateQuantity rounds loose lines to 2dp", () => {
    const { result } = renderHook(() => useVendorCart());
    act(() => result.current.addToCart(product, 1, "b1", 0, "POR_PESO", 9200, "c1"));
    act(() => result.current.updateQuantity("p-1", 0.285, "POR_PESO", "c1"));
    expect(result.current.items[0].quantity).toBe(0.29);
  });

  it("updateQuantity to a value that rounds to 0 removes the line", () => {
    const { result } = renderHook(() => useVendorCart());
    act(() => result.current.addToCart(product, 1, "b1", 0, "POR_PESO", 9200, "c1"));
    act(() => result.current.updateQuantity("p-1", 0.004, "POR_PESO", "c1"));
    expect(result.current.items).toHaveLength(0);
  });

  it("leaves BOLSA_CERRADA quantities untouched", () => {
    const { result } = renderHook(() => useVendorCart());
    act(() => result.current.addToCart(product, 3, "b1", 10));
    act(() => result.current.addToCart(product, 2, "b1", 10));
    expect(result.current.items[0].quantity).toBe(5);
    act(() => result.current.updateQuantity("p-1", 7));
    expect(result.current.items[0].quantity).toBe(7);
  });
});

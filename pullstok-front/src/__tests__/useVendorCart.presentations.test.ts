import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useVendorCart } from "../components/hooks/useVendorCart";
import type { DataItem, ProductPresentation } from "../types";

const product: DataItem = {
  _id: "p1", name: "Ibuprofeno", code: "F-1", price: 900, quantity: 0,
  category: "FARMACIA", hasPresentations: true,
};
const caja: ProductPresentation = { id: "c", name: "Caja", factor: 100, price: 900, wholesalePrice: 700, sortOrder: 0 };
const blister: ProductPresentation = { id: "b", name: "Blister", factor: 10, price: 150, wholesalePrice: null, sortOrder: 1 };
const pending: ProductPresentation = { id: "x", name: "Pack", factor: 0, price: 50, wholesalePrice: null, sortOrder: 2 };

const add = (
  result: { current: ReturnType<typeof useVendorCart> },
  presentation: ProductPresentation,
  qty = 1,
  stock = 250,
  wholesale = false,
) =>
  act(() =>
    result.current.addToCart(product, qty, "b1", stock, "BOLSA_CERRADA", undefined, undefined, undefined, wholesale, undefined, presentation),
  );

describe("useVendorCart presentations", () => {
  beforeEach(() => localStorage.clear());

  it("adds a line named after the presentation with its price and snapshot", () => {
    const { result } = renderHook(() => useVendorCart());
    add(result, blister, 2);
    const item = result.current.items[0];
    expect(item).toMatchObject({
      productId: "p1", name: "Ibuprofeno (Blister)", price: 150, quantity: 2,
      saleMode: "BOLSA_CERRADA", presentationId: "b", presentationName: "Blister", presentationFactor: 10,
    });
    // stock cap in presentations: floor(250 / 10)
    expect(item.stock).toBe(25);
    expect(result.current.totalAmount).toBe(300);
  });

  it("uses the wholesale price when the seller sells wholesale", () => {
    const { result } = renderHook(() => useVendorCart());
    add(result, caja, 1, 250, true);
    expect(result.current.items[0].price).toBe(700);
  });

  it("same presentation increments, different presentation is a separate line", () => {
    const { result } = renderHook(() => useVendorCart());
    add(result, blister);
    add(result, blister, 2);
    add(result, caja);
    expect(result.current.items).toHaveLength(2);
    expect(result.current.items.find((i) => i.presentationId === "b")?.quantity).toBe(3);
  });

  it("updateQuantity and removeFromCart target the presentation line only", () => {
    const { result } = renderHook(() => useVendorCart());
    add(result, blister);
    add(result, caja);
    act(() => result.current.updateQuantity("p1", 4, "BOLSA_CERRADA", undefined, "b"));
    expect(result.current.items.find((i) => i.presentationId === "b")?.quantity).toBe(4);
    expect(result.current.items.find((i) => i.presentationId === "c")?.quantity).toBe(1);
    act(() => result.current.removeFromCart("p1", "BOLSA_CERRADA", undefined, "b"));
    expect(result.current.items.map((i) => i.presentationId)).toEqual(["c"]);
  });

  it("factor 0 lines are not capped by stock", () => {
    const { result } = renderHook(() => useVendorCart());
    add(result, pending, 1, 0);
    expect(result.current.items[0].stock).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("products without presentation keep the legacy identity", () => {
    const { result } = renderHook(() => useVendorCart());
    act(() => result.current.addToCart({ ...product, hasPresentations: false }, 1, "b1", 5));
    expect(result.current.items[0].presentationId).toBeUndefined();
    expect(result.current.items[0].name).toBe("Ibuprofeno");
  });
});

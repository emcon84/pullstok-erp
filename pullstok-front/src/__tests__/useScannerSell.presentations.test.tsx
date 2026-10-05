import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useVendorCart } from "@/components/hooks/useVendorCart";
import { planScanSell, useScannerSell, type ScannedProduct } from "@/components/hooks/useScannerSell";
import type { ProductPresentation } from "@/types";

const caja: ProductPresentation = { id: "c", name: "Caja", factor: 100, price: 900, wholesalePrice: null, sortOrder: 0 };
const blister: ProductPresentation = { id: "b", name: "Blister", factor: 10, price: 150, wholesalePrice: null, sortOrder: 1 };
const pending: ProductPresentation = { id: "x", name: "Pack", factor: 0, price: 50, wholesalePrice: null, sortOrder: 2 };

const pharma = (over: Partial<ScannedProduct> = {}): ScannedProduct => ({
  id: "p1", name: "Ibuprofeno", price: 900, quantity: 0, category: "FARMACIA",
  hasPresentations: true, presentations: [caja, blister, pending], ...over,
});

function setup(stock = 35) {
  const getBranchStock = vi.fn().mockResolvedValue(stock);
  const hook = renderHook(() => {
    const cart = useVendorCart();
    const sell = useScannerSell({ cart, branchId: "b1", getBranchStock });
    return { cart, sell };
  });
  return hook;
}

describe("planScanSell with factor", () => {
  it("gates by base units (quantity × factor ≤ stock)", () => {
    expect(planScanSell({ currentQty: 0, stock: 35, factor: 10 })).toEqual({ kind: "add", quantity: 1 });
    expect(planScanSell({ currentQty: 3, stock: 35, factor: 10 })).toEqual({ kind: "blocked", reason: "max-stock" });
    expect(planScanSell({ currentQty: 0, stock: 5, factor: 10 })).toEqual({ kind: "blocked", reason: "no-stock" });
  });
  it("skips the gate for factor 0", () => {
    expect(planScanSell({ currentQty: 4, stock: 0, factor: 0 })).toEqual({ kind: "set", quantity: 5 });
  });
});

describe("useScannerSell with presentations", () => {
  beforeEach(() => localStorage.clear());

  it("opens the picker instead of adding when the product has presentations", async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.sell.addScanned(pharma());
    });
    expect(result.current.cart.items).toHaveLength(0);
    expect(result.current.sell.picker).toMatchObject({ stock: 35, product: { id: "p1" } });
  });

  it("adds the chosen presentation, increments it on the same choice, separates others", async () => {
    const { result } = setup();
    await act(async () => { await result.current.sell.addScanned(pharma()); });
    act(() => { result.current.sell.confirmPresentation(blister); });
    expect(result.current.sell.picker).toBeNull();
    expect(result.current.cart.items[0]).toMatchObject({
      name: "Ibuprofeno (Blister)", presentationId: "b", quantity: 1, price: 150,
    });
    await act(async () => { await result.current.sell.addScanned(pharma()); });
    act(() => { result.current.sell.confirmPresentation(blister); });
    expect(result.current.cart.items[0].quantity).toBe(2);
    await act(async () => { await result.current.sell.addScanned(pharma()); });
    act(() => { result.current.sell.confirmPresentation(pending); });
    expect(result.current.cart.items).toHaveLength(2);
  });

  it("blocks when base units would exceed stock, but not for factor 0", async () => {
    const { result } = setup(25);
    await act(async () => { await result.current.sell.addScanned(pharma()); });
    act(() => { result.current.sell.confirmPresentation(blister); });
    await act(async () => { await result.current.sell.addScanned(pharma()); });
    act(() => { result.current.sell.confirmPresentation(blister); });
    await act(async () => { await result.current.sell.addScanned(pharma()); });
    let out: any;
    act(() => { out = result.current.sell.confirmPresentation(blister); });
    expect(out).toMatchObject({ ok: false, reason: "max-stock" });
    expect(result.current.cart.items[0].quantity).toBe(2);
    act(() => { out = result.current.sell.confirmPresentation(pending); });
    expect(out.ok).toBe(true);
  });

  it("+ / − adjust the last presentation line with the base-unit gate", async () => {
    const { result } = setup(25);
    await act(async () => { await result.current.sell.addScanned(pharma()); });
    act(() => { result.current.sell.confirmPresentation(blister); });
    act(() => result.current.sell.adjustLast(1));
    act(() => result.current.sell.adjustLast(1)); // 3 × 10 > 25 → ignored
    expect(result.current.cart.items[0].quantity).toBe(2);
    act(() => result.current.sell.adjustLast(-1));
    act(() => result.current.sell.adjustLast(-1));
    expect(result.current.cart.items).toHaveLength(0);
  });

  it("cancelPicker closes without touching the cart; products without presentations are unchanged", async () => {
    const { result } = setup();
    await act(async () => { await result.current.sell.addScanned(pharma()); });
    act(() => result.current.sell.cancelPicker());
    expect(result.current.sell.picker).toBeNull();
    await act(async () => {
      await result.current.sell.addScanned(pharma({ hasPresentations: false, presentations: undefined }));
    });
    expect(result.current.cart.items[0]).toMatchObject({ name: "Ibuprofeno", quantity: 1 });
    expect(result.current.cart.items[0].presentationId).toBeUndefined();
  });
});

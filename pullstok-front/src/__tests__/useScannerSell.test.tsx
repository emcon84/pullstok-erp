import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useVendorCart } from "@/components/hooks/useVendorCart";
import {
  planScanSell,
  useScannerSell,
  type ScannedProduct,
} from "@/components/hooks/useScannerSell";

describe("planScanSell", () => {
  it("adds the first unit when the product is not in the cart and has stock", () => {
    expect(planScanSell({ currentQty: 0, stock: 3 })).toEqual({ kind: "add", quantity: 1 });
  });

  it("increments when the product is already in the cart", () => {
    expect(planScanSell({ currentQty: 2, stock: 5 })).toEqual({ kind: "set", quantity: 3 });
  });

  it("blocks with no-stock when there is no stock at all", () => {
    expect(planScanSell({ currentQty: 0, stock: 0 })).toEqual({ kind: "blocked", reason: "no-stock" });
  });

  it("blocks with max-stock when the cart already holds all the stock", () => {
    expect(planScanSell({ currentQty: 3, stock: 3 })).toEqual({ kind: "blocked", reason: "max-stock" });
  });

  it("does not cap manual products (the server does not validate their stock)", () => {
    expect(planScanSell({ currentQty: 0, stock: 0, isManual: true })).toEqual({ kind: "add", quantity: 1 });
    expect(planScanSell({ currentQty: 9, stock: 0, isManual: true })).toEqual({ kind: "set", quantity: 10 });
  });
});

const product = (over: Partial<ScannedProduct> = {}): ScannedProduct => ({
  id: "p1",
  name: "Collar de Cuero",
  code: "SKU-1",
  price: 1500,
  quantity: 0,
  ...over,
});

function setup(opts: { stock?: number; branchId?: string | null; sellsWholesale?: boolean } = {}) {
  const getBranchStock = vi.fn().mockResolvedValue(opts.stock ?? 5);
  const hook = renderHook(() => {
    const cart = useVendorCart();
    const sell = useScannerSell({
      cart,
      branchId: opts.branchId === undefined ? "b1" : opts.branchId,
      sellsWholesale: opts.sellsWholesale,
      getBranchStock,
    });
    return { cart, sell };
  });
  return { ...hook, getBranchStock };
}

describe("useScannerSell", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("adds 1 unit of the scanned product to the shared cart", async () => {
    const { result, getBranchStock } = setup({ stock: 5 });
    let outcome: Awaited<ReturnType<typeof result.current.sell.addScanned>> | undefined;
    await act(async () => {
      outcome = await result.current.sell.addScanned(product());
    });
    expect(outcome).toEqual({ ok: true, name: "Collar de Cuero", quantity: 1 });
    expect(getBranchStock).toHaveBeenCalledWith("p1", "b1");
    expect(result.current.cart.items).toHaveLength(1);
    expect(result.current.cart.items[0]).toMatchObject({
      productId: "p1",
      quantity: 1,
      price: 1500,
      stock: 5,
      branchId: "b1",
      saleMode: "BOLSA_CERRADA",
    });
    expect(JSON.parse(localStorage.getItem("vendor-cart") || "[]")).toHaveLength(1);
  });

  it("increments the same product on a second scan", async () => {
    const { result } = setup({ stock: 5 });
    await act(async () => {
      await result.current.sell.addScanned(product());
    });
    let outcome: Awaited<ReturnType<typeof result.current.sell.addScanned>> | undefined;
    await act(async () => {
      outcome = await result.current.sell.addScanned(product());
    });
    expect(outcome).toEqual({ ok: true, name: "Collar de Cuero", quantity: 2 });
    expect(result.current.cart.items).toHaveLength(1);
    expect(result.current.cart.items[0].quantity).toBe(2);
  });

  it("refuses a product without stock and leaves the cart untouched", async () => {
    const { result } = setup({ stock: 0 });
    let outcome: Awaited<ReturnType<typeof result.current.sell.addScanned>> | undefined;
    await act(async () => {
      outcome = await result.current.sell.addScanned(product());
    });
    expect(outcome).toMatchObject({ ok: false, reason: "no-stock" });
    expect(result.current.cart.items).toHaveLength(0);
  });

  it("refuses to exceed the available stock", async () => {
    const { result } = setup({ stock: 1 });
    await act(async () => {
      await result.current.sell.addScanned(product());
    });
    let outcome: Awaited<ReturnType<typeof result.current.sell.addScanned>> | undefined;
    await act(async () => {
      outcome = await result.current.sell.addScanned(product());
    });
    expect(outcome).toMatchObject({ ok: false, reason: "max-stock" });
    expect(result.current.cart.items[0].quantity).toBe(1);
  });

  it("refuses when there is no branch selected", async () => {
    const { result, getBranchStock } = setup({ branchId: null });
    let outcome: Awaited<ReturnType<typeof result.current.sell.addScanned>> | undefined;
    await act(async () => {
      outcome = await result.current.sell.addScanned(product());
    });
    expect(outcome).toMatchObject({ ok: false, reason: "no-branch" });
    expect(getBranchStock).not.toHaveBeenCalled();
    expect(result.current.cart.items).toHaveLength(0);
  });

  it("does not add anything when the stock lookup fails", async () => {
    const { result, getBranchStock } = setup();
    getBranchStock.mockRejectedValueOnce(new Error("offline"));
    let outcome: Awaited<ReturnType<typeof result.current.sell.addScanned>> | undefined;
    await act(async () => {
      outcome = await result.current.sell.addScanned(product());
    });
    expect(outcome).toMatchObject({ ok: false, reason: "stock-unavailable" });
    expect(result.current.cart.items).toHaveLength(0);
  });

  it("uses the wholesale price when the user sells wholesale", async () => {
    const { result } = setup({ sellsWholesale: true });
    await act(async () => {
      await result.current.sell.addScanned(product({ wholesalePrice: 1200 }));
    });
    expect(result.current.cart.items[0].price).toBe(1200);
  });

  it("exposes the last added line live so +/- reflect the cart quantity", async () => {
    const { result } = setup({ stock: 5 });
    expect(result.current.sell.lastAdded).toBeNull();
    await act(async () => {
      await result.current.sell.addScanned(product());
    });
    expect(result.current.sell.lastAdded).toMatchObject({ productId: "p1", name: "Collar de Cuero", quantity: 1 });

    act(() => result.current.sell.adjustLast(1));
    expect(result.current.sell.lastAdded?.quantity).toBe(2);
    expect(result.current.cart.items[0].quantity).toBe(2);

    act(() => result.current.sell.adjustLast(-1));
    expect(result.current.sell.lastAdded?.quantity).toBe(1);
  });

  it("caps + at the stock and drops the line (and feedback) when - reaches zero", async () => {
    const { result } = setup({ stock: 1 });
    await act(async () => {
      await result.current.sell.addScanned(product());
    });
    act(() => result.current.sell.adjustLast(1));
    expect(result.current.cart.items[0].quantity).toBe(1);

    act(() => result.current.sell.adjustLast(-1));
    expect(result.current.cart.items).toHaveLength(0);
    expect(result.current.sell.lastAdded).toBeNull();
  });
});

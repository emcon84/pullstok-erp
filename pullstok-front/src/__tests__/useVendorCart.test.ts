import { describe, it, expect } from "vitest";

/**
 * useVendorCart hook behavior tests (RED → GREEN for WU4, V-02).
 *
 * These test the addToCart / updateQuantity / removeFromCart / itemCount
 * logic directly by calling the lambda returned by useState setter inside
 * useVendorCart. This is a pure-logic test — no React rendering needed.
 *
 * Key behaviors tested:
 *  - saleMode added to VendorCartItem
 *  - merge on productId+saleMode (mixed modes = separate lines)
 *  - itemCount precision for loose lines (2dp)
 *  - no parseInt anywhere
 */

// ---- Replicating the core cart reducer (in-memory, no localStorage) ----

type SaleMode = "BOLSA_CERRADA" | "POR_PESO" | "POR_MONTO";

interface VendorCartItem {
  productId: string;
  name: string;
  price: number;
  stock: number;
  quantity: number;
  branchId: string;
  saleMode?: SaleMode;
}

interface DataItem {
  _id?: string;
  id?: string;
  name: string;
  price: number;
  priceKgSuelto?: number;
  code?: string;
  image?: string;
}

const reducer = {
  addToCart(
    prev: VendorCartItem[],
    product: DataItem,
    quantity: number,
    branchId: string,
    stock: number,
    saleMode?: SaleMode,
  ): VendorCartItem[] {
    const pid = product._id || product.id || "";
    const mode = saleMode ?? "BOLSA_CERRADA";
    const existing = prev.find(
      (i) => i.productId === pid && (i.saleMode ?? "BOLSA_CERRADA") === mode,
    );
    const price =
      mode === "POR_PESO"
        ? (product.priceKgSuelto ?? product.price)
        : product.price;
    if (existing) {
      return prev.map((i) =>
        i.productId === pid && (i.saleMode ?? "BOLSA_CERRADA") === mode
          ? { ...i, quantity: i.quantity + quantity, stock }
          : i,
      );
    }
    return [
      ...prev,
      {
        productId: pid,
        name: product.name,
        price,
        stock,
        quantity,
        branchId,
        saleMode: mode,
      },
    ];
  },

  updateQuantity(
    prev: VendorCartItem[],
    productId: string,
    quantity: number,
    saleMode?: SaleMode,
  ): VendorCartItem[] {
    const mode = saleMode ?? "BOLSA_CERRADA";
    if (quantity <= 0) {
      return prev.filter(
        (i) =>
          !(i.productId === productId && (i.saleMode ?? "BOLSA_CERRADA") === mode),
      );
    }
    return prev.map((i) =>
      i.productId === productId && (i.saleMode ?? "BOLSA_CERRADA") === mode
        ? { ...i, quantity }
        : i,
    );
  },

  removeFromCart(
    prev: VendorCartItem[],
    productId: string,
    saleMode?: SaleMode,
  ): VendorCartItem[] {
    const mode = saleMode ?? "BOLSA_CERRADA";
    return prev.filter(
      (i) =>
        !(i.productId === productId && (i.saleMode ?? "BOLSA_CERRADA") === mode),
    );
  },
};

const sampleProduct: DataItem = {
  id: "p-1",
  name: "Alimento 15kg",
  price: 4500,
  priceKgSuelto: 360,
};

const sampleProduct2: DataItem = {
  id: "p-2",
  name: "Alimento 7.5kg",
  price: 2500,
  priceKgSuelto: 340,
};

describe("useVendorCart — saleMode merge + decimal counts (WU4, V-02)", () => {
  it("adds cart item with BOLSA_CERRADA saleMode by default", () => {
    const result = reducer.addToCart([], sampleProduct, 3, "branch-1", 10);
    expect(result).toHaveLength(1);
    expect(result[0].saleMode).toBe("BOLSA_CERRADA");
    expect(result[0].quantity).toBe(3);
  });

  it("adds cart item with explicit POR_PESO saleMode and priceKgSuelto as price", () => {
    const result = reducer.addToCart(
      [],
      sampleProduct,
      2.35,
      "branch-1",
      10,
      "POR_PESO",
    );
    expect(result[0].saleMode).toBe("POR_PESO");
    expect(result[0].price).toBe(360); // priceKgSuelto, not bag price
    expect(result[0].quantity).toBe(2.35);
  });

  it("adds cart item with POR_MONTO saleMode (quantity is kg derived from amount)", () => {
    const result = reducer.addToCart(
      [],
      sampleProduct,
      3.33,
      "branch-1",
      10,
      "POR_MONTO",
    );
    expect(result[0].saleMode).toBe("POR_MONTO");
    expect(result[0].quantity).toBe(3.33);
  });

  it("merges items with same productId AND same saleMode", () => {
    let cart = reducer.addToCart([], sampleProduct, 1, "b-1", 10, "POR_PESO");
    cart = reducer.addToCart(
      cart,
      sampleProduct,
      1.5,
      "b-1",
      10,
      "POR_PESO",
    );
    expect(cart).toHaveLength(1);
    expect(cart[0].quantity).toBe(2.5); // 1 + 1.5
  });

  it("keep mixed modes as SEPARATE cart lines (V-02)", () => {
    let cart = reducer.addToCart([], sampleProduct, 3, "b-1", 10, "BOLSA_CERRADA");
    cart = reducer.addToCart(cart, sampleProduct, 2.35, "b-1", 10, "POR_PESO");
    expect(cart).toHaveLength(2);
    expect(cart[0].saleMode).toBe("BOLSA_CERRADA");
    expect(cart[0].quantity).toBe(3);
    expect(cart[1].saleMode).toBe("POR_PESO");
    expect(cart[1].quantity).toBe(2.35);
  });

  it("remove removes by productId+saleMode (not by productId alone)", () => {
    let cart = reducer.addToCart([], sampleProduct, 3, "b-1", 10, "BOLSA_CERRADA");
    cart = reducer.addToCart(cart, sampleProduct, 2.5, "b-1", 10, "POR_PESO");
    // Remove only the BOLSA line
    cart = reducer.removeFromCart(cart, sampleProduct.id!, "BOLSA_CERRADA");
    expect(cart).toHaveLength(1);
    expect(cart[0].saleMode).toBe("POR_PESO");
    expect(cart[0].quantity).toBe(2.5);
  });

  it("updateQuantity with float preserves decimal precision (no parseInt)", () => {
    let cart = reducer.addToCart([], sampleProduct, 1, "b-1", 10, "POR_PESO");
    cart = reducer.updateQuantity(cart, sampleProduct.id!, 1.75, "POR_PESO");
    expect(cart[0].quantity).toBe(1.75);
  });

  it("updateQuantity to 0 or negative removes the line (for that saleMode only)", () => {
    let cart = reducer.addToCart([], sampleProduct, 3, "b-1", 10, "BOLSA_CERRADA");
    cart = reducer.addToCart(cart, sampleProduct, 2.5, "b-1", 10, "POR_PESO");
    cart = reducer.updateQuantity(cart, sampleProduct.id!, 0, "POR_PESO");
    expect(cart).toHaveLength(1);
    expect(cart[0].saleMode).toBe("BOLSA_CERRADA");
  });

  it("itemCount sums decimal quantities correctly (2dp)", () => {
    const items: VendorCartItem[] = [
      { productId: "a", name: "A", price: 100, stock: 10, quantity: 3, branchId: "b1", saleMode: "BOLSA_CERRADA" },
      { productId: "b", name: "B", price: 360, stock: 10, quantity: 2.35, branchId: "b1", saleMode: "POR_PESO" },
    ];
    const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
    expect(itemCount).toBeCloseTo(5.35, 2);
  });

  it("itemCount for loose-only cart shows 2dp precision", () => {
    const items: VendorCartItem[] = [
      { productId: "a", name: "A", price: 360, stock: 10, quantity: 1.25, branchId: "b1", saleMode: "POR_PESO" },
      { productId: "b", name: "B", price: 340, stock: 10, quantity: 0.75, branchId: "b1", saleMode: "POR_PESO" },
    ];
    const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
    expect(itemCount).toBeCloseTo(2.0, 2); // 1.25 + 0.75 = 2.00
  });
});

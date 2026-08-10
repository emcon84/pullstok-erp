import { useState, useCallback, useEffect } from "react";
import type { DataItem } from "../../types";

export type SaleMode = "BOLSA_CERRADA" | "POR_PESO" | "POR_MONTO";

export interface VendorCartItem {
  productId: string;
  name: string;
  code: string;
  image?: string;
  price: number;
  stock: number; // available stock in vendor's branch
  quantity: number;
  branchId: string; // vendor's assigned branch
  saleMode?: SaleMode; // default BOLSA_CERRADA if absent
  priceKgSuelto?: number | null; // for POR_MONTO kg preview
}

const STORAGE_KEY = "vendor-cart";

function readCart(): VendorCartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeCart(items: VendorCartItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function useVendorCart() {
  const [items, setItems] = useState<VendorCartItem[]>(readCart);

  // Sync to localStorage on every change
  useEffect(() => {
    writeCart(items);
  }, [items]);

  const addToCart = useCallback(
    (
      product: DataItem,
      quantity: number,
      branchId: string,
      stock: number,
      saleMode?: SaleMode,
    ) => {
      setItems((prev) => {
        const pid = product._id || product.id;
        // Merge on productId + saleMode: mixed modes = separate cart lines (V-02).
        const mode = saleMode ?? "BOLSA_CERRADA";
        const existing = prev.find(
          (i) => i.productId === pid && (i.saleMode ?? "BOLSA_CERRADA") === mode,
        );
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
            productId: pid!,
            name: product.name,
            code: product.code || "",
            image: product.image,
            price: mode === "POR_PESO"
              ? (product.priceKgSuelto ?? Number(product.price))
              : Number(product.price),
            stock,
            quantity,
            branchId,
            saleMode: mode,
            priceKgSuelto: product.priceKgSuelto ?? null,
          },
        ];
      });
    },
    [],
  );

  const updateQuantity = useCallback(
    (productId: string, quantity: number, saleMode?: SaleMode) => {
      setItems((prev) => {
        const mode = saleMode ?? "BOLSA_CERRADA";
        return quantity <= 0
          ? prev.filter(
              (i) =>
                !(i.productId === productId && (i.saleMode ?? "BOLSA_CERRADA") === mode),
            )
          : prev.map((i) =>
              i.productId === productId && (i.saleMode ?? "BOLSA_CERRADA") === mode
                ? { ...i, quantity }
                : i,
            );
      });
    },
    [],
  );

  const removeFromCart = useCallback(
    (productId: string, saleMode?: SaleMode) => {
      const mode = saleMode ?? "BOLSA_CERRADA";
      setItems((prev) =>
        prev.filter(
          (i) =>
            !(i.productId === productId && (i.saleMode ?? "BOLSA_CERRADA") === mode),
        ),
      );
    },
    [],
  );

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const totalAmount = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

  return {
    items,
    totalAmount,
    itemCount,
    addToCart,
    updateQuantity,
    removeFromCart,
    clearCart,
  };
}

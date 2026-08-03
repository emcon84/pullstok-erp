import { useState, useCallback, useEffect } from "react";
import type { DataItem } from "../../types";

export interface VendorCartItem {
  productId: string;
  name: string;
  code: string;
  image?: string;
  price: number;
  stock: number; // available stock in vendor's branch
  quantity: number;
  branchId: string; // vendor's assigned branch
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
    (product: DataItem, quantity: number, branchId: string, stock: number) => {
      setItems((prev) => {
        const existing = prev.find((i) => i.productId === (product._id || product.id));
        if (existing) {
          return prev.map((i) =>
            i.productId === (product._id || product.id)
              ? { ...i, quantity: i.quantity + quantity, stock }
              : i,
          );
        }
        return [
          ...prev,
          {
            productId: (product._id || product.id)!,
            name: product.name,
            code: product.code || "",
            image: product.image,
            price: Number(product.price),
            stock,
            quantity,
            branchId,
          },
        ];
      });
    },
    [],
  );

  const updateQuantity = useCallback((productId: string, quantity: number) => {
    setItems((prev) =>
      quantity <= 0
        ? prev.filter((i) => i.productId !== productId)
        : prev.map((i) => (i.productId === productId ? { ...i, quantity } : i)),
    );
  }, []);

  const removeFromCart = useCallback((productId: string) => {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  }, []);

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

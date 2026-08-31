import { useState, useCallback, useEffect } from "react";
import type { DataItem } from "../../types";
import { unitPrice } from "./vendorCatalogHelpers";

export type SaleMode = "BOLSA_CERRADA" | "POR_PESO" | "POR_MONTO" | "POR_UNIDAD";

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
  /** Id de la celda PriceKgPrice (venta suelta): identifica la línea al
   *  vender; ausente = bolsa cerrada de un producto físico. */
  loosePriceId?: string;
  /** Nombre de la línea suelta ("MARCA · TIPO") para el payload de la venta. */
  looseName?: string;
  // sdd/venta-por-unidad-multpack: multi-pack vendible por unidad. Se guardan
  // para mostrar/precio del drawer del carrito y para armar el payload del
  // checkout (POR_UNIDAD usa perUnitPrice, la caja usa product.price).
  unitsPerBox?: number | null;
  perUnitPrice?: number | null;
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
      // Precio por kg que MANDA (sdd/precios-suelto-planilla C-05): la celda
      // de la planilla, no el priceKgSuelto guardado en el producto. Cuando
      // viene, gana sobre product.priceKgSuelto para el precio del item.
      priceKgSueltoOverride?: number | null,
      // Ventas sueltas desde la planilla: id de la celda PriceKgPrice (la
      // línea) y su nombre. La celda PARTICIPA del merge para no unir líneas
      // distintas del mismo producto físico.
      loosePriceId?: string,
      looseName?: string,
    ) => {
      setItems((prev) => {
        const pid = product._id || product.id;
        // Merge on productId + saleMode + celda suelta: mixed modes, y el
        // mismo producto físico vendido desde celdas distintas, son líneas
        // separadas (V-02).
        const mode = saleMode ?? "BOLSA_CERRADA";
        const kgPrice =
          priceKgSueltoOverride ?? product.priceKgSuelto ?? Number(product.price);
        const matches = (i: VendorCartItem) =>
          i.productId === pid &&
          (i.saleMode ?? "BOLSA_CERRADA") === mode &&
          (i.loosePriceId ?? null) === (loosePriceId ?? null);
        const existing = prev.find(matches);
        if (existing) {
          return prev.map((i) =>
            matches(i) ? { ...i, quantity: i.quantity + quantity, stock } : i,
          );
        }
        return [
          ...prev,
          {
            productId: pid!,
            name: product.name,
            code: product.code || "",
            image: product.image,
            price: mode === "POR_MONTO"
              ? 1 // amount IS the total; backend computes kg from priceKgSuelto
              : mode === "POR_UNIDAD"
              ? unitPrice(product) ?? Number(product.price) // price per unit
              : mode !== "BOLSA_CERRADA"
              ? kgPrice
              : Number(product.price),
            stock,
            quantity,
            branchId,
            saleMode: mode,
            priceKgSuelto: priceKgSueltoOverride ?? product.priceKgSuelto ?? null,
            loosePriceId: loosePriceId ?? undefined,
            looseName: looseName ?? undefined,
            unitsPerBox: product.unitsPerBox ?? null,
            perUnitPrice: unitPrice(product),
          },
        ];
      });
    },
    [],
  );

  const updateQuantity = useCallback(
    (
      productId: string,
      quantity: number,
      saleMode?: SaleMode,
      loosePriceId?: string,
    ) => {
      setItems((prev) => {
        const mode = saleMode ?? "BOLSA_CERRADA";
        const matches = (i: VendorCartItem) =>
          i.productId === productId &&
          (i.saleMode ?? "BOLSA_CERRADA") === mode &&
          (i.loosePriceId ?? null) === (loosePriceId ?? null);
        return quantity <= 0
          ? prev.filter((i) => !matches(i))
          : prev.map((i) => (matches(i) ? { ...i, quantity } : i));
      });
    },
    [],
  );

  const removeFromCart = useCallback(
    (productId: string, saleMode?: SaleMode, loosePriceId?: string) => {
      const mode = saleMode ?? "BOLSA_CERRADA";
      setItems((prev) =>
        prev.filter(
          (i) =>
            !(
              i.productId === productId &&
              (i.saleMode ?? "BOLSA_CERRADA") === mode &&
              (i.loosePriceId ?? null) === (loosePriceId ?? null)
            ),
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

import { useState, useCallback } from "react";
import type { RefObject } from "react";
import { toast } from "react-toastify";
import { useCreateSale } from "./useSales";
import { branchQty } from "./vendorCatalogHelpers";
import type { DataItem } from "../../types";
import type { CartItem } from "../../models/salesModel";
import type { SaleMode } from "./useVendorCart";
import { round2 } from "../../lib/money";

interface UseVendorQuantityModalParams {
  branchId: string;
  searchInputRef: RefObject<HTMLInputElement>;
  addToCart: (
    product: DataItem,
    quantity: number,
    branchId: string,
    stock: number,
    saleMode?: SaleMode,
    priceKgSuelto?: number | null,
  ) => void;
}

/**
 * Dominio del modal de cantidad del vendor: apertura/cierre, cantidad elegida,
 * agregar al pedido y venta directa 1-tap desde el showroom. Presentational
 * sólo: no conoce UI más allá del estado que expone.
 *
 * Al cerrar, libera el foco del buscador: si queda foco en el input, los
 * atajos globales de una sola letra (C/P/V) quedan bloqueados por el guard
 * isTypingInInput y la letra se escribe en el buscador en vez de ejecutar
 * el acceso rápido. Es el guard que protege tipear "café", así que el blur
 * acá es lo que deja la C viva DESPUÉS de armar el pedido.
 */
export function useVendorQuantityModal({
  branchId,
  searchInputRef,
  addToCart,
}: UseVendorQuantityModalParams) {
  const { createSale } = useCreateSale();

  const [qtyModal, setQtyModal] = useState<{ product: DataItem } | null>(null);
  const [qty, setQty] = useState<number>(1);
  const [directSelling, setDirectSelling] = useState(false);
  const [saleMode, setSaleMode] = useState<SaleMode>("BOLSA_CERRADA");
  // POR_MONTO: vendor enters amount, we preview kg
  const [amount, setAmount] = useState<number>(0);

  const releaseSearchFocus = useCallback(() => {
    searchInputRef.current?.blur();
  }, [searchInputRef]);

  const openQtyModal = useCallback((product: DataItem) => {
    // Default to POR_PESO if product is loose-eligible; else BOLSA_CERRADA.
    const isLoose = (product.priceKgSuelto ?? 0) > 0;
    setQty(isLoose ? 0.01 : 1);
    setSaleMode(isLoose ? "POR_PESO" : "BOLSA_CERRADA");
    setAmount(0);
    setQtyModal({ product });
  }, []);

  const closeQtyModal = useCallback(() => {
    setQtyModal(null);
    releaseSearchFocus();
  }, [releaseSearchFocus]);

  const confirmAddToCart = useCallback(() => {
    if (!qtyModal) return;
    const stock = branchQty(qtyModal.product);
    const actualQty =
      saleMode === "POR_MONTO"
        ? round2(amount / (qtyModal.product.priceKgSuelto ?? 1))
        : qty;
    const priceKgSuelto = qtyModal.product.priceKgSuelto ?? null;
    addToCart(qtyModal.product, actualQty, branchId, stock, saleMode, priceKgSuelto);
    toast.success(`"${qtyModal.product.name}" agregado al pedido`);
    setQtyModal(null);
    releaseSearchFocus();
  }, [qtyModal, qty, amount, saleMode, addToCart, branchId, releaseSearchFocus]);

  // ── Direct sale from showroom modal (1-tap single product sale) ──
  const handleDirectSale = useCallback(async () => {
    if (!qtyModal) return;
    const p = qtyModal.product;
    const stock = branchQty(p);
    if (stock <= 0) {
      toast.error("Producto sin stock");
      return;
    }
    const actualQty =
      saleMode === "POR_MONTO"
        ? round2(amount / (p.priceKgSuelto ?? 1))
        : qty;
    setDirectSelling(true);
    try {
      const cart: CartItem[] = [
        {
          product: {
            _id: (p._id || p.id) as string,
            id: (p._id || p.id) as string,
            name: p.name,
            price: saleMode === "POR_PESO"
              ? (p.priceKgSuelto ?? Number(p.price ?? 0))
              : Number(p.price ?? 0),
            quantity: stock,
            description: "",
            category: "",
          },
          quantity: actualQty,
          totalPrice:
            saleMode === "POR_MONTO"
              ? amount
              : (saleMode === "POR_PESO"
                  ? (p.priceKgSuelto ?? Number(p.price ?? 0))
                  : Number(p.price ?? 0)) * actualQty,
          saleMode,
        },
      ];
      await createSale({ cart });
      toast.success(`Venta directa realizada (${actualQty}x "${p.name}")`);
      setQtyModal(null);
      releaseSearchFocus();
    } catch (err: any) {
      toast.error(err?.message || "Error al realizar la venta directa");
    } finally {
      setDirectSelling(false);
    }
  }, [qtyModal, qty, amount, saleMode, createSale, releaseSearchFocus]);

  return {
    qtyModal,
    qty,
    setQty,
    directSelling,
    saleMode,
    setSaleMode,
    amount,
    setAmount,
    openQtyModal,
    closeQtyModal,
    confirmAddToCart,
    handleDirectSale,
  };
}

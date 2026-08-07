import { useState, useCallback } from "react";
import type { RefObject } from "react";
import { toast } from "react-toastify";
import { useCreateSale } from "./useSales";
import { branchQty } from "./vendorCatalogHelpers";
import type { DataItem } from "../../types";
import type { CartItem } from "../../models/salesModel";

interface UseVendorQuantityModalParams {
  branchId: string;
  searchInputRef: RefObject<HTMLInputElement>;
  addToCart: (
    product: DataItem,
    quantity: number,
    branchId: string,
    stock: number,
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
  const [qty, setQty] = useState(1);
  const [directSelling, setDirectSelling] = useState(false);

  const releaseSearchFocus = useCallback(() => {
    searchInputRef.current?.blur();
  }, [searchInputRef]);

  const openQtyModal = useCallback((product: DataItem) => {
    setQty(1);
    setQtyModal({ product });
  }, []);

  const closeQtyModal = useCallback(() => {
    setQtyModal(null);
    releaseSearchFocus();
  }, [releaseSearchFocus]);

  const confirmAddToCart = useCallback(() => {
    if (!qtyModal) return;
    const stock = branchQty(qtyModal.product);
    addToCart(qtyModal.product, qty, branchId, stock);
    toast.success(`"${qtyModal.product.name}" agregado al pedido`);
    setQtyModal(null);
    releaseSearchFocus();
  }, [qtyModal, qty, addToCart, branchId, releaseSearchFocus]);

  // ── Direct sale from showroom modal (1-tap single product sale) ──
  const handleDirectSale = useCallback(async () => {
    if (!qtyModal) return;
    const p = qtyModal.product;
    const stock = branchQty(p);
    if (stock <= 0) {
      toast.error("Producto sin stock");
      return;
    }
    setDirectSelling(true);
    try {
      const cart: CartItem[] = [
        {
          product: {
            _id: (p._id || p.id) as string,
            id: (p._id || p.id) as string,
            name: p.name,
            price: Number(p.price ?? 0),
            quantity: stock,
            description: "",
            category: "",
          },
          quantity: qty,
          totalPrice: Number(p.price ?? 0) * qty,
        },
      ];
      await createSale({ cart });
      toast.success(`Venta directa realizada (${qty}x "${p.name}")`);
      setQtyModal(null);
      releaseSearchFocus();
    } catch (err: any) {
      toast.error(err?.message || "Error al realizar la venta directa");
    } finally {
      setDirectSelling(false);
    }
  }, [qtyModal, qty, createSale, releaseSearchFocus]);

  return {
    qtyModal,
    qty,
    setQty,
    directSelling,
    openQtyModal,
    closeQtyModal,
    confirmAddToCart,
    handleDirectSale,
  };
}

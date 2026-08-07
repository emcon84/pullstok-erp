import { useState, useCallback } from "react";
import { toast } from "react-toastify";
import { useCreateSale } from "./useSales";
import { branchQty } from "./vendorCatalogHelpers";
import type { DataItem } from "../../types";
import type { CartItem } from "../../models/salesModel";

interface UseVendorQuantityModalParams {
  branchId: string;
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
 */
export function useVendorQuantityModal({
  branchId,
  addToCart,
}: UseVendorQuantityModalParams) {
  const { createSale } = useCreateSale();

  const [qtyModal, setQtyModal] = useState<{ product: DataItem } | null>(null);
  const [qty, setQty] = useState(1);
  const [directSelling, setDirectSelling] = useState(false);

  const openQtyModal = useCallback((product: DataItem) => {
    setQty(1);
    setQtyModal({ product });
  }, []);

  const closeQtyModal = useCallback(() => {
    setQtyModal(null);
  }, []);

  const confirmAddToCart = useCallback(() => {
    if (!qtyModal) return;
    const stock = branchQty(qtyModal.product);
    addToCart(qtyModal.product, qty, branchId, stock);
    toast.success(`"${qtyModal.product.name}" agregado al pedido`);
    setQtyModal(null);
  }, [qtyModal, qty, addToCart, branchId]);

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
    } catch (err: any) {
      toast.error(err?.message || "Error al realizar la venta directa");
    } finally {
      setDirectSelling(false);
    }
  }, [qtyModal, qty, createSale]);

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

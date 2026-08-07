import { useState, useCallback } from "react";
import { toast } from "react-toastify";
import { useCreateSale } from "./useSales";
import { useCreateOrder } from "./useOrder";
import { branchQty } from "./vendorCatalogHelpers";
import type { VendorCartItem } from "./useVendorCart";
import type { DataItem } from "../../types";
import type { CartItem } from "../../models/salesModel";
import type { CreateOrder } from "../../models/orderModel";

interface UseVendorSaleActionsParams {
  branchId: string;
  cartItems: VendorCartItem[];
  addToCart: (
    product: DataItem,
    quantity: number,
    branchId: string,
    stock: number,
  ) => void;
  clearCart: () => void;
  totalAmount: number;
}

/**
 * Lógica de negocio de ventas/pedidos del vendor: modal de cantidad, venta
 * directa 1-tap, confirmación del carrito y guardado de pedido pendiente.
 * Presentational sólo: no conoce UI más allá del estado que expone.
 */
export function useVendorSaleActions({
  branchId,
  cartItems,
  addToCart,
  clearCart,
  totalAmount,
}: UseVendorSaleActionsParams) {
  const { createSale } = useCreateSale();
  const { submitOrder, loading: savingOrder } = useCreateOrder();

  const [qtyModal, setQtyModal] = useState<{ product: DataItem } | null>(null);
  const [qty, setQty] = useState(1);
  const [cartOpen, setCartOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
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

  // ── Confirm sale ──
  const handleConfirmSale = useCallback(async () => {
    if (cartItems.length === 0) return;
    setConfirming(true);
    try {
      const cart: CartItem[] = cartItems.map((i) => ({
        product: {
          _id: i.productId,
          id: i.productId,
          name: i.name,
          price: i.price,
          quantity: i.stock,
          description: "",
          category: "",
        },
        quantity: i.quantity,
        totalPrice: i.price * i.quantity,
      }));
      await createSale({ cart });
      clearCart();
      setCartOpen(false);
      toast.success("Pedido confirmado y vendido");
    } catch (err: any) {
      toast.error(err?.message || "Error al confirmar el pedido");
    } finally {
      setConfirming(false);
    }
  }, [cartItems, createSale, clearCart]);

  // ── Save cart as Pending Order ──
  // Mismo shape que el pedido directo de la vista Pedidos (Orders.tsx), más el
  // branchId de la sucursal del vendedor. Sin cliente: el backend resuelve el
  // genérico "Consumidor final" de la org. Se vende después desde Pedidos
  // (conversión order → sale ya existente).
  const handleSaveOrder = useCallback(() => {
    if (cartItems.length === 0) return;
    const orderPayload: CreateOrder = {
      type: "sale",
      products: cartItems.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        price: i.price,
      })),
      totalAmount,
      branchId,
    };
    submitOrder(orderPayload, {
      onSuccess: () => {
        clearCart();
        setCartOpen(false);
        toast.success("Pedido guardado — confirmá la venta desde Pedidos");
      },
      onError: (err) => {
        toast.error(err?.message || "Error al guardar el pedido");
      },
    });
  }, [cartItems, totalAmount, branchId, submitOrder, clearCart]);

  return {
    qtyModal,
    qty,
    setQty,
    directSelling,
    confirming,
    cartOpen,
    setCartOpen,
    savingOrder,
    openQtyModal,
    closeQtyModal,
    confirmAddToCart,
    handleDirectSale,
    handleConfirmSale,
    handleSaveOrder,
  };
}

import { useState, useCallback } from "react";
import { toast } from "react-toastify";
import { useCreateSale } from "./useSales";
import { useCreateOrder } from "./useOrder";
import type { VendorCartItem } from "./useVendorCart";
import type { CartItem } from "../../models/salesModel";
import type { CreateOrder } from "../../models/orderModel";

interface UseVendorCheckoutParams {
  branchId: string;
  cartOpen: boolean;
  setCartOpen: (v: boolean) => void;
  cartItems: VendorCartItem[];
  clearCart: () => void;
  totalAmount: number;
}

/**
 * Checkout del vendor: confirmación de la venta del carrito y guardado como
 * pedido pendiente. La visibilidad del sheet (cartOpen/setCartOpen) se recibe
 * de afuera: acá sólo se cierra tras confirmar o guardar.
 */
export function useVendorCheckout({
  branchId,
  setCartOpen,
  cartItems,
  clearCart,
  totalAmount,
}: UseVendorCheckoutParams) {
  const { createSale } = useCreateSale();
  const { submitOrder, loading: savingOrder } = useCreateOrder();

  const [confirming, setConfirming] = useState(false);

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
  }, [cartItems, createSale, clearCart, setCartOpen]);

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
  }, [cartItems, totalAmount, branchId, submitOrder, clearCart, setCartOpen]);

  return {
    confirming,
    savingOrder,
    handleConfirmSale,
    handleSaveOrder,
  };
}

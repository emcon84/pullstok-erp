import { useState, useCallback } from "react";
import { toast } from "react-toastify";
import { useCreateSale } from "./useSales";
import { useCreateOrder } from "./useOrder";
import type { VendorCartItem } from "./useVendorCart";
import type { CartItem } from "../../models/salesModel";
import type { CreateOrder } from "../../models/orderModel";
import type { PaymentInput } from "../../models/cashSessionModel";
import { buildSaleTicket, type SaleTicket, type TicketCompany } from "../../utils/saleTicket";

interface UseVendorCheckoutParams {
  branchId: string;
  /** Visibilidad del sheet legacy (VendorDashboard/PriceKgLookup). El POS
   *  unificado (UnifiedPos) ya no usa drawer: el panel queda siempre montado,
   *  así que no pasa estos y no cierra nada. */
  cartOpen?: boolean;
  setCartOpen?: (v: boolean) => void;
  cartItems: VendorCartItem[];
  clearCart: () => void;
  totalAmount: number;
  /** Encabezado del ticket térmico (nombre, logo, CUIT, dirección, teléfono).
   *  Opcional: los views legacy no lo pasan y el ticket usa el nombre por defecto. */
  ticketCompany?: TicketCompany;
}

/**
 * Checkout del vendor: confirmación de la venta del carrito y guardado como
 * pedido pendiente. La visibilidad del sheet (cartOpen/setCartOpen) es
 * opcional: el POS unificado mantiene un panel fijo y no la usa; los views
 * legacy (VendorDashboard/PriceKgLookup) la pasan y cierran tras confirmar.
 */
export function useVendorCheckout({
  branchId,
  setCartOpen,
  cartItems,
  clearCart,
  totalAmount,
  ticketCompany,
}: UseVendorCheckoutParams) {
  const { createSale } = useCreateSale();
  const { submitOrder, loading: savingOrder } = useCreateOrder();

  const [confirming, setConfirming] = useState(false);
  // Ticket de la última venta CONFIRMADA, pendiente de que el vendedor decida
  // si lo imprime. Solo se setea tras un createSale exitoso.
  const [pendingTicket, setPendingTicket] = useState<SaleTicket | null>(null);
  const dismissTicket = useCallback(() => setPendingTicket(null), []);

  // ── Confirm sale ──
  const handleConfirmSale = useCallback(
    async (
      payments?: PaymentInput[],
      cashSessionId?: string,
      discountPct?: number,
      surchargePct?: number,
    ) => {
      if (cartItems.length === 0) return;
      setConfirming(true);
      try {
        // Snapshot del ticket ANTES de clearCart(): el carrito se vacía al
        // confirmar. Si armarlo fallara, la venta igual sigue (solo no hay ticket).
        let ticket: SaleTicket | null = null;
        try {
          ticket = buildSaleTicket({
            ...ticketCompany,
            issuedAt: new Date(),
            items: cartItems,
            payments,
            discountPct,
            surchargePct,
          });
        } catch {
          ticket = null;
        }
        const cart: CartItem[] = cartItems.map((i) => ({
          product: {
            _id: i.productId,
            id: i.productId,
            name: i.name,
            // C-05: para POR_MONTO el precio unitario debe ser el de la CELDA de
            // la planilla (guardado en priceKgSuelto del item), no el price=1 de
            // la cuenta del carrito. Sin celda (showroom), priceKgSuelto ==
            // priceKgSuelto almacenado → mismo comportamiento que antes.
            // Multipack por unidad: product.price = perUnitPrice (nunca el del
            // price de caja del item).
            price:
              i.saleMode === "POR_UNIDAD"
                ? (i.perUnitPrice ?? i.price)
                : i.saleMode === "POR_MONTO"
                ? (i.priceKgSuelto ?? i.price)
                : i.price,
            quantity: i.stock,
            description: "",
            category: "",
          },
          quantity: i.quantity,
          totalPrice:
            (i.saleMode === "POR_UNIDAD" ? (i.perUnitPrice ?? i.price) : i.price) *
            i.quantity,
          saleMode: i.saleMode ?? "BOLSA_CERRADA",
          // Ventas sueltas: la celda de la planilla que identifica la línea.
          loosePriceId: i.loosePriceId,
          looseName: i.looseName,
          // sdd/venta-pastillas-sueltas-blister: conteo ad-hoc, el server lo
          // exige para recomputar el precio (T1/T2). i.price ya es el precio
          // por pastilla resuelto en el carrito (useVendorCart), no hace
          // falta un branch extra en el ternario de arriba.
          piecesPerBlister:
            i.saleMode === "POR_UNIDAD_BLISTER" ? i.piecesPerBlister ?? undefined : undefined,
        }));
        await createSale({ cart, payments, cashSessionId, discountPct, surchargePct });
        clearCart();
        setPendingTicket(ticket);
        setCartOpen?.(false);
        toast.success("Pedido confirmado y vendido");
      } catch (err: any) {
        toast.error(err?.message || "Error al confirmar el pedido");
      } finally {
        setConfirming(false);
      }
    },
    [cartItems, createSale, clearCart, ticketCompany],
  );

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
        setCartOpen?.(false);
        toast.success("Pedido guardado — confirmá la venta desde Pedidos");
      },
      onError: (err) => {
        toast.error(err?.message || "Error al guardar el pedido");
      },
    });
  }, [cartItems, totalAmount, branchId, submitOrder, clearCart]);

  return {
    confirming,
    savingOrder,
    handleConfirmSale,
    handleSaveOrder,
    pendingTicket,
    dismissTicket,
  };
}

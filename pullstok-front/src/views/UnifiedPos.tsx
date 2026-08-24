import { useState } from "react";
import { ShoppingCart } from "lucide-react";
import { VendorCatalogTab } from "@/components/organisms/VendorCatalogTab";
import { LooseSellTab } from "@/components/organisms/LooseSellTab";
import { useVendorCart } from "@/components/hooks/useVendorCart";
import { useVendorCheckout } from "@/components/hooks/useVendorCheckout";
import { useGetCurrentCashSession } from "@/components/hooks/useCashSession";
import { VendorCartSheet } from "@/components/molecules/VendorCartSheet";
import { cn } from "@/lib/utils";

type Tab = "unidad" | "suelto";

interface UnifiedPosProps {
  branchId: string;
}

/**
 * POS unificado del vendedor: UNA sola venta con dos pestañas que comparten el
 * MISMO carrito.
 * - "Por unidad": catálogo de bolsas (VendorCatalogTab).
 * - "Suelto": planilla marca × tipo → celda (LooseSellTab).
 * Un único carrito (useVendorCart), un solo checkout y un solo FAB + sheet para
 * cerrar el pedido MIXTO (BOLSA_CERRADA + POR_PESO/POR_MONTO).
 */
export const UnifiedPos = ({ branchId }: UnifiedPosProps) => {
  const [tab, setTab] = useState<Tab>("unidad");
  const [cartOpen, setCartOpen] = useState(false);

  // Carrito ÚNICO de todo el POS (compartido entre ambas pestañas vía props).
  const cart = useVendorCart();
  const checkout = useVendorCheckout({
    branchId,
    cartOpen,
    setCartOpen,
    cartItems: cart.items,
    clearCart: cart.clearCart,
    totalAmount: cart.totalAmount,
  });
  // Caja OPEN del vendedor (R8/R9): se propaga al confirmar la venta.
  const { session: currentSession } = useGetCurrentCashSession(branchId);

  const tabs: { id: Tab; label: string }[] = [
    { id: "unidad", label: "Por unidad" },
    { id: "suelto", label: "Suelto" },
  ];

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nueva venta</h1>
        <p className="text-sm text-muted-foreground">
          Vendé por unidad o suelto desde el mismo pedido
        </p>
      </div>

      {/* ── Segmented tabs ── */}
      <div className="flex w-fit gap-1 rounded-lg bg-muted p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex-1 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-colors",
              tab === t.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Pestaña activa ── */}
      {tab === "unidad" ? (
        <VendorCatalogTab
          branchId={branchId}
          cart={cart}
          onSaveOrder={checkout.handleSaveOrder}
          onConfirmSale={checkout.handleConfirmSale}
          onOpenCart={setCartOpen}
        />
      ) : (
        <LooseSellTab branchId={branchId} cart={cart} />
      )}

      {/* ── Cart FAB (un solo chip para todo el POS) ── */}
      {cart.itemCount > 0 && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-1">
          <span className="absolute inset-0 -m-3 animate-ping rounded-full bg-primary/20" />
          <span className="absolute inset-0 -m-6 animate-ping rounded-full bg-primary/10 [animation-delay:300ms]" />
          <button
            onClick={() => setCartOpen(true)}
            className="relative flex items-center gap-2 rounded-full bg-primary px-5 py-3.5 text-primary-foreground shadow-lg hover:bg-primary/90 transition-all active:scale-95 touch-manipulation"
          >
            <ShoppingCart className="h-5 w-5" />
            <span className="font-semibold text-sm">{cart.itemCount}</span>
            <span className="hidden sm:inline text-sm">
              — ${cart.totalAmount.toLocaleString("es-AR")}
            </span>
          </button>
        </div>
      )}

      {/* ── Cart slide-over (cierra el pedido mixto) ── */}
      <VendorCartSheet
        open={cartOpen}
        cart={{
          items: cart.items,
          totalAmount: cart.totalAmount,
        }}
        status={{
          confirming: checkout.confirming,
          savingOrder: checkout.savingOrder,
        }}
        handlers={{
          onOpenChange: setCartOpen,
          updateQty: cart.updateQuantity,
          remove: cart.removeFromCart,
          clearCart: cart.clearCart,
          saveOrder: checkout.handleSaveOrder,
          confirmSale: checkout.handleConfirmSale,
        }}
        cashSessionId={currentSession?.id}
      />
    </div>
  );
};

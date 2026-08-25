import { useState } from "react";
import { VendorCatalogTab } from "@/components/organisms/VendorCatalogTab";
import { LooseSellTab } from "@/components/organisms/LooseSellTab";
import { useVendorCart } from "@/components/hooks/useVendorCart";
import { useVendorCheckout } from "@/components/hooks/useVendorCheckout";
import { useGetCurrentCashSession } from "@/components/hooks/useCashSession";
import { VendorOrderPanel } from "@/components/molecules/VendorOrderPanel";
import { cn } from "@/lib/utils";

type Tab = "unidad" | "suelto";

interface UnifiedPosProps {
  branchId: string;
}

/**
 * POS unificado del vendedor: UNA sola venta con dos pestañas que comparten el
 * MISMO carrito, y un PANEL de pedido siempre visible a la derecha.
 * - "Por unidad": catálogo de bolsas con carga inline (VendorCatalogTab).
 * - "Suelto": planilla marca × tipo → celda (LooseSellTab).
 * Un único carrito (useVendorCart), un solo checkout y un panel fijo que
 * muestra y cierra el pedido MIXTO (BOLSA_CERRADA + POR_PESO/POR_MONTO).
 */
export const UnifiedPos = ({ branchId }: UnifiedPosProps) => {
  const [tab, setTab] = useState<Tab>("unidad");

  // Carrito ÚNICO de todo el POS (compartido entre ambas pestañas vía props).
  const cart = useVendorCart();
  const checkout = useVendorCheckout({
    branchId,
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
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
      {/* ── Columna izquierda: header + tabs + contenido ── */}
      <div className="min-w-0 space-y-4">
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
          />
        ) : (
          <LooseSellTab
            branchId={branchId}
            cart={cart}
            onSaveOrder={checkout.handleSaveOrder}
            onConfirmSale={checkout.handleConfirmSale}
          />
        )}
      </div>

      {/* ── Columna derecha: panel de pedido SIEMPRE visible ── */}
      <VendorOrderPanel
        cart={cart}
        status={{
          confirming: checkout.confirming,
          savingOrder: checkout.savingOrder,
        }}
        saveOrder={checkout.handleSaveOrder}
        confirmSale={checkout.handleConfirmSale}
        cashSessionId={currentSession?.id}
        className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]"
      />
    </div>
  );
};

import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Landmark } from "lucide-react";
import { VendorCatalogTab } from "@/components/organisms/VendorCatalogTab";
import { LooseSellTab } from "@/components/organisms/LooseSellTab";
import { useVendorCart } from "@/components/hooks/useVendorCart";
import { useVendorCheckout } from "@/components/hooks/useVendorCheckout";
import { useGetCurrentCashSession } from "@/components/hooks/useCashSession";
import { VendorOrderPanel, type VendorOrderPanelApi } from "@/components/molecules/VendorOrderPanel";
import { Loader } from "@/components/atoms/loader";
import { Button } from "@/components/ui/button";
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
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("unidad");

  // Modal de pago: lo abre la tecla V (listado y panel) y el botón Vender.
  const [paymentOpen, setPaymentOpen] = useState(false);
  const openPayment = useCallback(() => setPaymentOpen(true), []);

  // Carrito ÚNICO de todo el POS (compartido entre ambas pestañas vía props).
  const cart = useVendorCart();
  const checkout = useVendorCheckout({
    branchId,
    cartItems: cart.items,
    clearCart: cart.clearCart,
    totalAmount: cart.totalAmount,
  });
  // Caja OPEN del vendedor (R8/R9): GATE — sin caja abierta no se puede vender
  // ni guardar pedido; también se propaga al confirmar la venta.
  const { session: currentSession, loading: cashLoading } = useGetCurrentCashSession(branchId);

  // ── Navegación por teclado entre el listado y el panel de pedido ──
  // El listado (tab) y el panel se registran acá para saltar de zona con las
  // flechas: ↓ en la última fila → panel; ↑ en el primer control → listado.
  const panelApiRef = useRef<VendorOrderPanelApi | null>(null);
  const gridApiRef = useRef<{ focusSelectedRow: () => void } | null>(null);

  const focusPanelFirst = useCallback(() => {
    panelApiRef.current?.focusFirstControl();
  }, []);

  const exitToGrid = useCallback(() => {
    gridApiRef.current?.focusSelectedRow();
  }, []);

  const registerGridApi = useCallback(
    (api: { focusSelectedRow: () => void }) => {
      gridApiRef.current = api;
    },
    [],
  );

  // Tecla T: alterna entre "Por unidad" y "Suelto".
  const toggleTab = useCallback(() => {
    setTab((t) => (t === "unidad" ? "suelto" : "unidad"));
  }, []);

  const tabs: { id: Tab; label: string }[] = [
    { id: "unidad", label: "Por unidad" },
    { id: "suelto", label: "Suelto" },
  ];

  // ── Gate: la caja del día debe estar abierta para vender/guardar pedidos ──
  if (cashLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader />
      </div>
    );
  }
  if (!currentSession) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <Landmark className="h-6 w-6 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Caja no abierta</h2>
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            Para vender o guardar pedidos necesitás tener abierta la caja del día
            en esta sucursal.
          </p>
        </div>
        <Button onClick={() => navigate("/caja")}>Abrir caja</Button>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
      {/* ── Columna izquierda: header + tabs + contenido ── */}
      <div className="min-w-0 space-y-4 lg:flex lg:h-[calc(100vh_-_2rem)] lg:flex-col lg:space-y-0 lg:overflow-hidden">
        <div className="space-y-4 lg:shrink-0">
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
        </div>

        {/* ── Pestaña activa. En desktop la columna queda fija y es la LISTA la
             que scrollea internamente (buscador/filtros fijos arriba) ── */}
        <div className="min-h-0 lg:flex-1 lg:flex lg:flex-col lg:pr-1">
          {tab === "unidad" ? (
            <VendorCatalogTab
              branchId={branchId}
              cart={cart}
              onSaveOrder={checkout.handleSaveOrder}
              onConfirmSale={openPayment}
              onEnterPanel={focusPanelFirst}
              onToggleTab={toggleTab}
              registerGridApi={registerGridApi}
            />
          ) : (
            <LooseSellTab
              branchId={branchId}
              cart={cart}
              onSaveOrder={checkout.handleSaveOrder}
              onConfirmSale={openPayment}
              onEnterPanel={focusPanelFirst}
              onToggleTab={toggleTab}
              registerGridApi={registerGridApi}
            />
          )}
        </div>
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
        apiRef={panelApiRef}
        onExitToGrid={exitToGrid}
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        className="lg:sticky lg:top-4 lg:max-h-[calc(100vh_-_2rem)]"
      />
    </div>
  );
};

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { ShoppingCart, Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useVendorCart } from "@/components/hooks/useVendorCart";
import { usePayments } from "@/components/hooks/usePayments";
import { usePanelKeyboard } from "@/components/hooks/usePanelKeyboard";
import { PaymentSection } from "@/components/molecules/PaymentSection";
import { CartItemRow, stepQty } from "@/components/molecules/CartItemRow";
import type { PaymentInput } from "@/models/cashSessionModel";
import { round2 } from "@/lib/money";
import { clampPct } from "@/components/hooks/vendorRowHelpers";

/** API que el panel expone para entrar por teclado desde el listado. */
export interface VendorOrderPanelApi {
  focusFirstControl: () => void;
}

type VendorCart = ReturnType<typeof useVendorCart>;

interface VendorOrderStatus {
  confirming: boolean;
  savingOrder: boolean;
}

interface VendorOrderPanelProps {
  cart: VendorCart;
  status: VendorOrderStatus;
  saveOrder: () => void;
  confirmSale: (
    payments?: PaymentInput[],
    cashSessionId?: string,
    discountPct?: number,
  ) => void;
  /** Id de la caja OPEN del vendedor (R8/R9). */
  cashSessionId?: string;
  /** Clases extra del contenedor (para el posicionamiento sticky en UnifiedPos). */
  className?: string;
  /** API para entrar al panel por teclado desde el listado (↓ última fila). */
  apiRef?: React.MutableRefObject<VendorOrderPanelApi | null>;
  /** Se llama al salir del panel por teclado (↑ primer control → listado). */
  onExitToGrid?: () => void;
}

const money = (n: number) =>
  n.toLocaleString("es-AR", { minimumFractionDigits: 2 });

/**
 * Panel de pedido del POS vendedor (sdd/precios-suelto-planilla / venta-descuento).
 * Reemplaza el drawer (VendorCartSheet) del flujo UNIFICADO: SIEMPRE visible y
 * fijo, sin overlay ni Radix Sheet. Es propietario del descuento % (nivel venta)
 * y de la sección de medios de pago (usePayments). Recibe el carrito y los
 * handlers por props (los crea UnifiedPos).
 */
export const VendorOrderPanel = ({
  cart,
  status,
  saveOrder,
  confirmSale,
  cashSessionId,
  className,
  apiRef,
  onExitToGrid,
}: VendorOrderPanelProps) => {
  // ── Descuento % a nivel venta. Estado como STRING (el patrón correcto: type
  // text + inputMode decimal + onFocus select + clamp 0..100). type="number"
  // tiene el bug de no seleccionar el 0 al enfocar ni dropear el 0 inicial. ──
  const [discountStr, setDiscountStr] = useState("0");
  const discountPct = clampPct(Number(discountStr) || 0);

  const subtotal = cart.totalAmount;
  const discountAmount = round2((subtotal * discountPct) / 100);
  const total = round2(subtotal - discountAmount);

  const pay = usePayments(total);

  // ── Navegación por teclado dentro del panel (roving focus ↑/↓) ──
  const asideRef = useRef<HTMLElement>(null);
  const getFocusables = useCallback(() => {
    const root = asideRef.current;
    if (!root) return [];
    return Array.from(
      root.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
      ),
    ).filter((el) => el.getClientRects().length > 0);
  }, []);

  // +/− de teclado sobre un ítem del pedido: mapea el lineKey a la línea del
  // carrito y ajusta su cantidad (misma regla de paso según el modo).
  const handleStepQty = useCallback(
    (lineKey: string, delta: 1 | -1) => {
      const item = cart.items.find(
        (i) =>
          `${i.productId}::${i.saleMode ?? "BOLSA_CERRADA"}::${i.loosePriceId ?? "bolsa"}` ===
          lineKey,
      );
      if (!item) return;
      cart.updateQuantity(item.productId, stepQty(item, delta), item.saleMode, item.loosePriceId);
    },
    [cart.items, cart.updateQuantity],
  );

  usePanelKeyboard({
    panelRef: asideRef,
    getFocusables,
    onExitToGrid: () => onExitToGrid?.(),
    onStepQty: handleStepQty,
  });

  const focusFirstControl = useCallback(() => {
    getFocusables()[0]?.focus();
  }, [getFocusables]);

  useEffect(() => {
    if (apiRef) apiRef.current = { focusFirstControl };
    return () => {
      if (apiRef) apiRef.current = null;
    };
  }, [apiRef, focusFirstControl]);

  const handleConfirm = () => {
    confirmSale(pay.finalize(), cashSessionId, discountPct);
  };

  const handleDiscountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.trim();
    if (raw === "" || /^\d{0,3}$/.test(raw)) {
      const v = Number(raw);
      setDiscountStr(v > 100 ? "100" : raw);
    }
  };

  const handleClear = () => {
    cart.clearCart();
    toast.info("Pedido vacío");
  };

  return (
    <aside
      ref={asideRef}
      className={
        "flex flex-col rounded-xl border bg-background shadow-sm " +
        (className ?? "")
      }
      aria-label="Tu pedido"
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">Tu pedido</h2>
          {cart.itemCount > 0 && (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
              {cart.itemCount}
            </span>
          )}
        </div>
        {cart.items.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={handleClear}
            disabled={status.confirming || status.savingOrder}
          >
            <Eraser className="h-3.5 w-3.5" />
            Vaciar
          </Button>
        )}
      </div>

      {cart.items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center">
          <ShoppingCart className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            Sin productos en el pedido
          </p>
          <p className="text-xs text-muted-foreground/70">
            Usá ↑/↓ y Enter para agregar desde el listado
          </p>
        </div>
      ) : (
        <>
          {/* ── Items ── */}
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {cart.items.map((item) => (
              <CartItemRow
                key={`${item.productId}-${item.saleMode ?? "BOLSA_CERRADA"}-${item.loosePriceId ?? "bolsa"}`}
                item={item}
                onUpdateQty={(qty) =>
                  cart.updateQuantity(
                    item.productId,
                    qty,
                    item.saleMode,
                    item.loosePriceId,
                  )
                }
                onRemove={() =>
                  cart.removeFromCart(
                    item.productId,
                    item.saleMode,
                    item.loosePriceId,
                  )
                }
              />
            ))}
          </div>

          {/* ── Descuento + totales + pago + acciones ── */}
          <div className="space-y-3 border-t px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="order-discount" className="shrink-0">
                Descuento (%)
              </Label>
              <Input
                id="order-discount"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={discountStr}
                onFocus={(e) => e.currentTarget.select()}
                onChange={handleDiscountChange}
                className="w-24 text-right"
                placeholder="0"
              />
            </div>

            <div className="space-y-1 text-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="tabular-nums">${money(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Descuento</span>
                <span className="tabular-nums">−${money(discountAmount)}</span>
              </div>
              <div className="flex items-center justify-between text-lg font-bold">
                <span>Total</span>
                <span className="tabular-nums">${money(total)}</span>
              </div>
            </div>

            <PaymentSection
              idPrefix="pay"
              payments={pay.payments}
              selectedMethod={pay.selectedMethod}
              setSelectedMethod={pay.setSelectedMethod}
              cashReceived={pay.cashReceived}
              setCashReceived={pay.setCashReceived}
              addPayment={pay.addPayment}
              clearPayments={pay.clearPayments}
              total={total}
              amountInput={pay.amountInput}
              setAmountInput={pay.setAmountInput}
            />

            {pay.vuelto > 0 && (
              <div className="flex items-center justify-between rounded-lg bg-emerald-50 p-2 text-sm">
                <span>Vuelto</span>
                <span className="font-bold tabular-nums">
                  ${money(pay.vuelto)}
                </span>
              </div>
            )}

            <div className="flex flex-col gap-2 pt-1">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  size="lg"
                  onClick={saveOrder}
                  disabled={
                    status.confirming ||
                    status.savingOrder ||
                    cart.items.length === 0
                  }
                >
                  {status.savingOrder ? "Guardando..." : "Guardar pedido"}
                </Button>
              </div>
              <Button
                className="w-full"
                size="lg"
                onClick={handleConfirm}
                disabled={
                  status.confirming || status.savingOrder || cart.items.length === 0
                }
              >
                {status.confirming ? "Procesando..." : "Vender"}
              </Button>
            </div>
          </div>
        </>
      )}
    </aside>
  );
};

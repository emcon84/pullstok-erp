import { useState } from "react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { VendorCartItem, SaleMode } from "@/components/hooks/useVendorCart";
import { usePayments } from "@/components/hooks/usePayments";
import { PaymentSection } from "@/components/molecules/PaymentSection";
import { CartItemRow } from "@/components/molecules/CartItemRow";
import type { PaymentInput } from "@/models/cashSessionModel";
import { round2 } from "@/lib/money";

interface VendorCartData {
  items: VendorCartItem[];
  totalAmount: number;
}

interface VendorCartStatus {
  confirming: boolean;
  savingOrder: boolean;
}

interface VendorCartHandlers {
  onOpenChange: (open: boolean) => void;
  updateQty: (
    productId: string,
    quantity: number,
    saleMode?: SaleMode,
    loosePriceId?: string,
  ) => void;
  remove: (productId: string, saleMode?: SaleMode, loosePriceId?: string) => void;
  clearCart: () => void;
  saveOrder: () => void;
  confirmSale: (payments?: PaymentInput[], cashSessionId?: string, discountPct?: number) => void;
}

interface VendorCartSheetProps {
  open: boolean;
  cart: VendorCartData;
  status: VendorCartStatus;
  handlers: VendorCartHandlers;
  /** Id de la caja OPEN del vendedor (R8/R9). */
  cashSessionId?: string;
}

export const VendorCartSheet = ({
  open,
  cart,
  status,
  handlers,
  cashSessionId,
}: VendorCartSheetProps) => {
  // ── Descuento porcentual a nivel venta (sdd/venta-descuento) ──
  // El vendedor ingresa un % (0..100); el descuento en $ se materializa acá con
  // round2 y `total` (subtotal − descuento) es lo que alimenta el cálculo del
  // vuelto, el saldo restante (addPayment) y el payload de payments (R7).
  const [discountPct, setDiscountPct] = useState<number>(0);
  const subtotal = cart.totalAmount;
  const discountAmount = round2((subtotal * discountPct) / 100);
  const total = round2(subtotal - discountAmount);

  // ── Medios de pago (R6-R8, R10): selector de método + vuelto ──
  // La lógica de payments/cashReceived/vuelto vive en usePayments; al confirmar
  // se pasa el payload final (finalize) + cashSessionId + discountPct.
  const pay = usePayments(total);

  const handleConfirm = () => {
    // Payload final: los payments declarados deben sumar el total DESCONTADO
    // (R7). Si no se declaró nada (o solo se ingresó efectivo recibido sin
    // método), se declara EFECTIVO por el total. El vuelto (recibido - total)
    // NO se persiste — R10.
    handlers.confirmSale(pay.finalize(), cashSessionId, discountPct);
  };

  const handleDiscountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = Number(e.target.value);
    setDiscountPct(Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : 0);
  };

  return (
    <Sheet open={open} onOpenChange={handlers.onOpenChange}>
      <SheetContent className="w-full sm:max-w-md flex flex-col px-6">
        <SheetHeader className="px-0">
          <SheetTitle className="flex items-center justify-between">
            <span>Tu pedido</span>
          </SheetTitle>
        </SheetHeader>

        {cart.items.length === 0 ? (
          <p className="py-12 text-center text-muted-foreground">
            El pedido está vacío.
          </p>
        ) : (
          <>
            {/* Cart items */}
            <div className="flex-1 overflow-auto -mx-6 px-6 space-y-3 mt-4 mb-2">
              {cart.items.map((item) => (
                <CartItemRow
                  key={`${item.productId}-${item.saleMode ?? "BOLSA_CERRADA"}-${item.loosePriceId ?? "bolsa"}`}
                  item={item}
                  onUpdateQty={(qty) =>
                    handlers.updateQty(
                      item.productId,
                      qty,
                      item.saleMode,
                      item.loosePriceId,
                    )
                  }
                  onRemove={() =>
                    handlers.remove(item.productId, item.saleMode, item.loosePriceId)
                  }
                />
              ))}
            </div>

            {/* Footer: discount + totals + payment + actions */}
            <div className="border-t pt-4 space-y-3 mt-2 pb-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="cart-discount" className="shrink-0">
                  Descuento (%)
                </Label>
                <Input
                  id="cart-discount"
                  type="number"
                  min={0}
                  max={100}
                  step="1"
                  value={discountPct}
                  onChange={handleDiscountChange}
                  className="w-28"
                />
              </div>

              <div className="space-y-1 text-sm">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="tabular-nums">
                    ${subtotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Descuento</span>
                  <span className="tabular-nums">
                    −${discountAmount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex items-center justify-between text-lg font-bold">
                  <span>Total</span>
                  <span className="tabular-nums">
                    ${total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </span>
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
              />

              {pay.vuelto > 0 && (
                <div className="flex items-center justify-between rounded-lg bg-emerald-50 p-2 text-sm">
                  <span>Vuelto</span>
                  <span className="font-bold tabular-nums">
                    ${pay.vuelto.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    size="lg"
                    onClick={() => {
                      handlers.clearCart();
                      handlers.onOpenChange(false);
                      toast.info("Pedido cancelado");
                    }}
                    disabled={status.confirming || status.savingOrder}
                  >
                    Cancelar
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    size="lg"
                    onClick={handlers.saveOrder}
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
                  disabled={status.confirming || status.savingOrder}
                >
                  {status.confirming ? "Procesando..." : "Vender directo"}
                </Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};

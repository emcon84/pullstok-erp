import { toast } from "react-toastify";
import { Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { VendorCartItem, SaleMode } from "@/components/hooks/useVendorCart";
import { usePayments } from "@/components/hooks/usePayments";
import { PaymentSection } from "@/components/molecules/PaymentSection";
import type { PaymentInput } from "@/models/cashSessionModel";

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
  confirmSale: (payments?: PaymentInput[], cashSessionId?: string) => void;
}

interface VendorCartSheetProps {
  open: boolean;
  cart: VendorCartData;
  status: VendorCartStatus;
  handlers: VendorCartHandlers;
  /** Id de la caja OPEN del vendedor (R8/R9). */
  cashSessionId?: string;
}

const MODE_LABEL: Record<string, string> = {
  POR_PESO: "por kg",
  POR_MONTO: "por $",
};

const formatQty = (item: VendorCartItem): string => {
  const mode = item.saleMode ?? "BOLSA_CERRADA";
  if (mode === "BOLSA_CERRADA") return String(Math.round(item.quantity));
  return item.quantity.toFixed(2);
};

export const VendorCartSheet = ({
  open,
  cart,
  status,
  handlers,
  cashSessionId,
}: VendorCartSheetProps) => {
  // ── Medios de pago (R6-R8, R10): selector de método + vuelto ──
  // La lógica de payments/cashReceived/vuelto vive en usePayments; al confirmar
  // se pasa el payload final (finalize) + cashSessionId.
  const total = cart.totalAmount;
  const pay = usePayments(total);

  const handleConfirm = () => {
    // Payload final: los payments declarados deben sumar el total (R7). Si no
    // se declaró nada (o solo se ingresó efectivo recibido sin método), se
    // declara EFECTIVO por el total. El vuelto (recibido - total) NO se
    // persiste — R10.
    handlers.confirmSale(pay.finalize(), cashSessionId);
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

            {/* Footer: payment + total + actions */}
            <div className="border-t pt-4 space-y-3 mt-2 pb-2">
              <div className="flex items-center justify-between text-lg font-bold">
                <span>Total</span>
                <span className="tabular-nums">
                  ${cart.totalAmount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </span>
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

// ── Cart item row ──

const CartItemRow = ({
  item,
  onUpdateQty,
  onRemove,
}: {
  item: VendorCartItem;
  onUpdateQty: (qty: number) => void;
  onRemove: () => void;
}) => {
  const mode = item.saleMode ?? "BOLSA_CERRADA";
  const isBolsa = mode === "BOLSA_CERRADA";
  const isLoose = mode === "POR_PESO" || mode === "POR_MONTO";

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium truncate">{item.name}</p>
          {isLoose && (
            <Badge variant="secondary" className="text-[10px] px-1 py-0">
              {MODE_LABEL[mode] ?? mode}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          ${item.price.toLocaleString("es-AR")} c/u
        </p>
        <p className="text-xs font-semibold">
          ${(item.price * item.quantity).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          disabled={
            isBolsa ? item.quantity <= 1 : item.quantity <= 0.01
          }
          onClick={() =>
            onUpdateQty(
              isBolsa
                ? item.quantity - 1
                : Math.max(0, Math.round((item.quantity - 0.01) * 100) / 100),
            )
          }
        >
          <Minus className="h-3 w-3" />
        </Button>
        <span className="w-10 text-center text-sm font-bold tabular-nums">
          {formatQty(item)}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          disabled={item.quantity >= item.stock}
          onClick={() =>
            onUpdateQty(
              isBolsa
                ? item.quantity + 1
                : Math.round((item.quantity + 0.01) * 100) / 100,
            )
          }
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
};

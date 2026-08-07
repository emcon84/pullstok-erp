import { toast } from "react-toastify";
import { Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { VendorCartItem } from "@/components/hooks/useVendorCart";

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
  updateQty: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  clearCart: () => void;
  saveOrder: () => void;
  confirmSale: () => void;
}

interface VendorCartSheetProps {
  open: boolean;
  cart: VendorCartData;
  status: VendorCartStatus;
  handlers: VendorCartHandlers;
}

export const VendorCartSheet = ({
  open,
  cart,
  status,
  handlers,
}: VendorCartSheetProps) => (
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
                key={item.productId}
                item={item}
                onUpdateQty={(qty) => handlers.updateQty(item.productId, qty)}
                onRemove={() => handlers.remove(item.productId)}
              />
            ))}
          </div>

          {/* Footer: total + actions */}
          <div className="border-t pt-4 space-y-3 mt-2 pb-2">
            <div className="flex items-center justify-between text-lg font-bold">
              <span>Total</span>
              <span className="tabular-nums">
                ${cart.totalAmount.toLocaleString("es-AR")}
              </span>
            </div>
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
                onClick={handlers.confirmSale}
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

// ── Cart item row ──

const CartItemRow = ({
  item,
  onUpdateQty,
  onRemove,
}: {
  item: VendorCartItem;
  onUpdateQty: (qty: number) => void;
  onRemove: () => void;
}) => (
  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium truncate">{item.name}</p>
      <p className="text-xs text-muted-foreground">
        ${item.price.toLocaleString("es-AR")} c/u
      </p>
      <p className="text-xs font-semibold">
        ${(item.price * item.quantity).toLocaleString("es-AR")}
      </p>
    </div>
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="icon"
        className="h-7 w-7"
        disabled={item.quantity <= 1}
        onClick={() => onUpdateQty(item.quantity - 1)}
      >
        <Minus className="h-3 w-3" />
      </Button>
      <span className="w-8 text-center text-sm font-bold tabular-nums">
        {item.quantity}
      </span>
      <Button
        variant="outline"
        size="icon"
        className="h-7 w-7"
        disabled={item.quantity >= item.stock}
        onClick={() => onUpdateQty(item.quantity + 1)}
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

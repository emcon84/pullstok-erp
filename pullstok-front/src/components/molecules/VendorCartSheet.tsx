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

interface VendorCartSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cartItems: VendorCartItem[];
  totalAmount: number;
  itemCount: number;
  confirming: boolean;
  savingOrder: boolean;
  onUpdateQty: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
  onClearCart: () => void;
  onSaveOrder: () => void;
  onConfirmSale: () => void;
}

export const VendorCartSheet = ({
  open,
  onOpenChange,
  cartItems,
  totalAmount,
  confirming,
  savingOrder,
  onUpdateQty,
  onRemove,
  onClearCart,
  onSaveOrder,
  onConfirmSale,
}: VendorCartSheetProps) => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent className="w-full sm:max-w-md flex flex-col px-6">
      <SheetHeader className="px-0">
        <SheetTitle className="flex items-center justify-between">
          <span>Tu pedido</span>
        </SheetTitle>
      </SheetHeader>

      {cartItems.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">
          El pedido está vacío.
        </p>
      ) : (
        <>
          {/* Cart items */}
          <div className="flex-1 overflow-auto -mx-6 px-6 space-y-3 mt-4 mb-2">
            {cartItems.map((item) => (
              <CartItemRow
                key={item.productId}
                item={item}
                onUpdateQty={(qty) => onUpdateQty(item.productId, qty)}
                onRemove={() => onRemove(item.productId)}
              />
            ))}
          </div>

          {/* Footer: total + actions */}
          <div className="border-t pt-4 space-y-3 mt-2 pb-2">
            <div className="flex items-center justify-between text-lg font-bold">
              <span>Total</span>
              <span className="tabular-nums">
                ${totalAmount.toLocaleString("es-AR")}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  size="lg"
                  onClick={() => {
                    onClearCart();
                    onOpenChange(false);
                    toast.info("Pedido cancelado");
                  }}
                  disabled={confirming || savingOrder}
                >
                  Cancelar
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  size="lg"
                  onClick={onSaveOrder}
                  disabled={confirming || savingOrder || cartItems.length === 0}
                >
                  {savingOrder ? "Guardando..." : "Guardar pedido"}
                </Button>
              </div>
              <Button
                className="w-full"
                size="lg"
                onClick={onConfirmSale}
                disabled={confirming || savingOrder}
              >
                {confirming ? "Procesando..." : "Vender directo"}
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

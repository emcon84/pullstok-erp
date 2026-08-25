import { Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { VendorCartItem } from "@/components/hooks/useVendorCart";

const MODE_LABEL: Record<string, string> = {
  POR_PESO: "por kg",
  POR_MONTO: "por $",
};

const formatQty = (item: VendorCartItem): string => {
  const mode = item.saleMode ?? "BOLSA_CERRADA";
  if (mode === "BOLSA_CERRADA") return String(Math.round(item.quantity));
  return item.quantity.toFixed(2);
};

/** Incremento/decremento seguro según el modo de la línea. */
const stepQty = (item: VendorCartItem, delta: 1 | -1): number => {
  const isBolsa = (item.saleMode ?? "BOLSA_CERRADA") === "BOLSA_CERRADA";
  if (isBolsa) return Math.max(1, Math.round(item.quantity) + delta);
  return Math.max(0, Math.round((item.quantity + delta * 0.01) * 100) / 100);
};

interface CartItemRowProps {
  item: VendorCartItem;
  onUpdateQty: (qty: number) => void;
  onRemove: () => void;
}

/**
 * Fila de un ítem del pedido (pos vendedor): nombre + badge de modo, precio
 * c/u, precio total, stepper de cantidad y botón quitar. Compartida por el
 * panel de pedido (VendorOrderPanel) y el drawer legacy (VendorCartSheet).
 */
export const CartItemRow = ({ item, onUpdateQty, onRemove }: CartItemRowProps) => {
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
          onClick={() => onUpdateQty(stepQty(item, -1))}
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
          onClick={() => onUpdateQty(stepQty(item, 1))}
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

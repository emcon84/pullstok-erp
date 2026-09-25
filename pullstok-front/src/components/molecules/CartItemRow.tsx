import { useEffect, useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { VendorCartItem } from "@/components/hooks/useVendorCart";
import { parseDecimal } from "@/components/hooks/vendorRowHelpers";

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
export const stepQty = (item: VendorCartItem, delta: 1 | -1): number => {
  const mode = item.saleMode ?? "BOLSA_CERRADA";
  // Por monto la cantidad es el total en $: se tipea, no se incrementa.
  if (mode === "POR_MONTO") return item.quantity;
  if (mode === "BOLSA_CERRADA") return Math.max(1, Math.round(item.quantity) + delta);
  // Por kilo: pasos de 1 kg (igual que el listado de la planilla).
  if (mode === "POR_PESO") return Math.max(0.01, Math.round((item.quantity + delta) * 100) / 100);
  return Math.max(0, Math.round((item.quantity + delta * 0.01) * 100) / 100);
};

interface CartItemRowProps {
  item: VendorCartItem;
  onUpdateQty: (qty: number) => void;
  onRemove: () => void;
}

interface LooseQtyInputProps {
  item: VendorCartItem;
  onCommit: (qty: number) => void;
}

/**
 * Input editable de cantidad (kg o $) de una línea suelta. Mantiene el texto
 * local mientras se tipea y confirma con Enter/blur; un valor inválido o <= 0
 * se descarta y se restaura la cantidad actual.
 */
const LooseQtyInput = ({ item, onCommit }: LooseQtyInputProps) => {
  const [text, setText] = useState(formatQty(item));

  // Re-sincroniza cuando la cantidad cambia desde afuera (+/−, teclado, merge).
  useEffect(() => {
    setText(formatQty(item));
  }, [item.quantity]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = () => {
    const value = parseDecimal(text);
    if (Number.isNaN(value) || value <= 0) {
      setText(formatQty(item));
      return;
    }
    const rounded = Math.round(value * 100) / 100;
    setText(rounded.toFixed(2));
    if (rounded !== item.quantity) onCommit(rounded);
  };

  return (
    <Input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      aria-label="Cantidad"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
      }}
      className="h-8 w-20 px-1 text-center text-sm font-bold tabular-nums"
    />
  );
};

/**
 * Fila de un ítem del pedido (pos vendedor): nombre + badge de modo, precio
 * c/u, precio total, cantidad y botón quitar. Compartida por el panel de pedido
 * (VendorOrderPanel) y el drawer legacy (VendorCartSheet).
 *
 * - Bolsa cerrada / unidades: stepper −/+ (tope = stock, salvo productos manuales).
 * - Suelto por kilo: −/+ sin tope de stock (lo valida el backend contra
 *   LooseStock) + input editable de kg.
 * - Suelto por monto: solo input editable del total en $.
 */
export const CartItemRow = ({ item, onUpdateQty, onRemove }: CartItemRowProps) => {
  const mode = item.saleMode ?? "BOLSA_CERRADA";
  const isBolsa = mode === "BOLSA_CERRADA";
  const isLoose = mode === "POR_PESO" || mode === "POR_MONTO";
  const showStepper = mode !== "POR_MONTO";

  return (
    <div
      data-line-key={`${item.productId}::${item.saleMode ?? "BOLSA_CERRADA"}::${item.loosePriceId ?? "bolsa"}`}
      className="flex items-center gap-3 p-3 rounded-lg bg-muted/50"
    >
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
        {showStepper && (
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            aria-label="Disminuir"
            disabled={
              isBolsa ? item.quantity <= 1 : item.quantity <= 0.01
            }
            onClick={() => onUpdateQty(stepQty(item, -1))}
          >
            <Minus className="h-3 w-3" />
          </Button>
        )}
        {isLoose ? (
          <LooseQtyInput item={item} onCommit={onUpdateQty} />
        ) : (
          <span className="w-10 text-center text-sm font-bold tabular-nums">
            {formatQty(item)}
          </span>
        )}
        {showStepper && (
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            aria-label="Aumentar"
            // El stock del carrito para líneas sueltas es 0 (lo resuelve el
            // backend contra LooseStock): no se topea en el cliente. Los
            // productos manuales tampoco (el server no valida su stock).
            disabled={!isLoose && !item.isManual && item.quantity >= item.stock}
            onClick={() => onUpdateQty(stepQty(item, 1))}
          >
            <Plus className="h-3 w-3" />
          </Button>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-destructive"
        aria-label="Quitar"
        onClick={onRemove}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
};

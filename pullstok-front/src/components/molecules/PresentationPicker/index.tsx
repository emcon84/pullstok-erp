import { useMemo, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  defaultPresentationId,
  formatStockLevels,
  isPresentationDisabled,
  presentationContentHint,
  presentationStockCap,
  resolvePresentationPrice,
  sellablePresentations,
} from "@/components/hooks/presentationHelpers";
import type { DataItem, ProductPresentation } from "@/types";

interface PresentationPickerProps {
  product: DataItem;
  sellsWholesale: boolean;
  /** Branch stock in BASE units; null/undefined = unknown (no option is disabled). */
  stock?: number | null;
  /** Quantity is passed only when `withQuantity` is on. */
  onConfirm: (presentation: ProductPresentation, quantity?: number) => void;
  onCancel: () => void;
  /** Shows a quantity stepper so several units go in with one confirmation. */
  withQuantity?: boolean;
}

const MAX_QTY = 999;

const money = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;

/**
 * Picker de presentaciones del POS (producto FARMACIA con presentaciones):
 * lista las vendibles (precio > 0), preselecciona la de mayor factor y se
 * maneja con teclado (↑/↓ mover, Enter confirmar, Esc cancelar) o click.
 */
export const PresentationPicker = ({
  product,
  sellsWholesale,
  stock,
  onConfirm,
  onCancel,
  withQuantity = false,
}: PresentationPickerProps) => {
  const all = product.presentations ?? [];
  const options = useMemo(() => sellablePresentations(all), [all]);
  const disabled = (p: ProductPresentation) => isPresentationDisabled(p, stock);

  const [activeId, setActiveId] = useState<string | null>(() => {
    const def = defaultPresentationId(options);
    const defOpt = options.find((o) => o.id === def);
    if (defOpt && !isPresentationDisabled(defOpt, stock)) return defOpt.id;
    return options.find((o) => !isPresentationDisabled(o, stock))?.id ?? null;
  });
  const listRef = useRef<HTMLDivElement>(null);

  // Quantity of the active presentation, capped by what the known base stock covers.
  const [rawQty, setRawQty] = useState(1);
  const active = options.find((o) => o.id === activeId);
  const maxQty = Math.max(
    1,
    Math.min(MAX_QTY, active && stock != null ? presentationStockCap(active, stock) : MAX_QTY),
  );
  const qty = Math.min(Math.max(rawQty, 0), maxQty);
  const stepQty = (delta: 1 | -1) => setRawQty(Math.min(maxQty, Math.max(1, qty + delta)));

  const move = (delta: 1 | -1) => {
    const enabled = options.filter((o) => !disabled(o));
    if (enabled.length === 0) return;
    const idx = enabled.findIndex((o) => o.id === activeId);
    const next = Math.min(enabled.length - 1, Math.max(0, (idx < 0 ? 0 : idx) + delta));
    setActiveId(enabled[next].id);
  };

  const confirm = (p: ProductPresentation | undefined) => {
    if (!p || disabled(p)) return;
    if (withQuantity) onConfirm(p, Math.max(1, Math.min(qty, maxQty)));
    else onConfirm(p);
  };

  const levels = stock != null ? formatStockLevels(stock, all) : "";

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent
        className="sm:max-w-sm"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          listRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{product.name}</DialogTitle>
          <DialogDescription>Elegí la presentación a vender</DialogDescription>
        </DialogHeader>

        <div
          ref={listRef}
          role="listbox"
          tabIndex={0}
          aria-label="Presentaciones"
          aria-activedescendant={activeId ? `presentation-opt-${activeId}` : undefined}
          className="space-y-2 outline-none"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              move(1);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              move(-1);
            } else if (e.key === "Enter") {
              e.preventDefault();
              confirm(options.find((o) => o.id === activeId));
            } else if (withQuantity && (e.key === "+" || e.key === "=")) {
              e.preventDefault();
              stepQty(1);
            } else if (withQuantity && e.key === "-") {
              e.preventDefault();
              stepQty(-1);
            }
          }}
        >
          {options.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Este producto no tiene presentaciones con precio.
            </p>
          )}
          {options.map((p) => {
            const isDisabled = disabled(p);
            const hint = presentationContentHint(p, all);
            const unitPrice = resolvePresentationPrice(p, sellsWholesale);
            const lineQty = withQuantity ? Math.max(1, qty) : 1;
            return (
              <div
                key={p.id}
                id={`presentation-opt-${p.id}`}
                role="option"
                aria-selected={p.id === activeId}
                aria-disabled={isDisabled || undefined}
                onClick={() => confirm(p)}
                className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 ${
                  p.id === activeId ? "border-primary bg-primary/10" : "bg-muted/40"
                } ${isDisabled ? "cursor-not-allowed opacity-50" : ""}`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{p.name}</p>
                  {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
                  {isDisabled && <p className="text-xs text-destructive">Sin stock suficiente</p>}
                </div>
                <div className="text-right">
                  <span className="text-lg font-bold tabular-nums">
                    {money(unitPrice * lineQty)}
                  </span>
                  {lineQty > 1 && (
                    <p className="text-xs text-muted-foreground tabular-nums">{money(unitPrice)} c/u</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {withQuantity && (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-muted p-3">
            <Label htmlFor="presentation-qty-input" className="text-sm font-medium">
              Cantidad
            </Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0"
                aria-label="Menos"
                disabled={qty <= 1}
                onClick={() => stepQty(-1)}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Input
                id="presentation-qty-input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={3}
                value={qty || ""}
                onFocus={(e) => e.target.select()}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "").slice(0, 3);
                  setRawQty(digits === "" ? 0 : Math.min(parseInt(digits, 10), maxQty));
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    confirm(active);
                  }
                }}
                className="h-9 w-16 shrink-0 text-center tabular-nums"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0"
                aria-label="Más"
                disabled={qty >= maxQty}
                onClick={() => stepQty(1)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {levels && <p className="text-xs text-muted-foreground">Stock: {levels}</p>}
      </DialogContent>
    </Dialog>
  );
};

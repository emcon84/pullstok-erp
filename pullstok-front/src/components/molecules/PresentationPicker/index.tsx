import { useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  defaultPresentationId,
  formatStockLevels,
  isPresentationDisabled,
  presentationContentHint,
  resolvePresentationPrice,
  sellablePresentations,
} from "@/components/hooks/presentationHelpers";
import type { DataItem, ProductPresentation } from "@/types";

interface PresentationPickerProps {
  product: DataItem;
  sellsWholesale: boolean;
  /** Branch stock in BASE units; null/undefined = unknown (no option is disabled). */
  stock?: number | null;
  onConfirm: (presentation: ProductPresentation) => void;
  onCancel: () => void;
}

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

  const move = (delta: 1 | -1) => {
    const enabled = options.filter((o) => !disabled(o));
    if (enabled.length === 0) return;
    const idx = enabled.findIndex((o) => o.id === activeId);
    const next = Math.min(enabled.length - 1, Math.max(0, (idx < 0 ? 0 : idx) + delta));
    setActiveId(enabled[next].id);
  };

  const confirm = (p: ProductPresentation | undefined) => {
    if (p && !disabled(p)) onConfirm(p);
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
                <span className="text-lg font-bold tabular-nums">
                  {money(resolvePresentationPrice(p, sellsWholesale))}
                </span>
              </div>
            );
          })}
        </div>

        {levels && <p className="text-xs text-muted-foreground">Stock: {levels}</p>}
      </DialogContent>
    </Dialog>
  );
};

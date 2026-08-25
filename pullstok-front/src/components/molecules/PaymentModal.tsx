import { useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PaymentSection } from "@/components/molecules/PaymentSection";
import { usePayments } from "@/components/hooks/usePayments";
import type { PaymentInput } from "@/models/cashSessionModel";

interface PaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Total a cobrar (subtotal − descuento). */
  total: number;
  cashSessionId?: string;
  discountPct: number;
  confirmSale: (
    payments?: PaymentInput[],
    cashSessionId?: string,
    discountPct?: number,
  ) => void;
}

const money = (n: number) =>
  n.toLocaleString("es-AR", { minimumFractionDigits: 2 });

/**
 * Modal de confirmación de pago del POS vendedor (venta-descuento).
 * Se abre al tocar Vender: arranca con EFECTIVO y el monto autocompletado con
 * el total (no hay que tipear nada para una venta en efectivo por el total).
 * Permite DESGLOSAR (efectivo + tarjeta + ...) y confirma la venta.
 *
 * Teclado: Enter en "Confirmar venta" (enfocado al abrir) genera la venta;
 * ↑/↓ navegan entre los controles; Esc / Cancelar cierran sin vender.
 */
export const PaymentModal = ({
  open,
  onOpenChange,
  total,
  cashSessionId,
  discountPct,
  confirmSale,
}: PaymentModalProps) => {
  const pay = usePayments(total);
  const contentRef = useRef<HTMLDivElement>(null);
  // Ref para leer el estado de pago más reciente desde el listener global.
  const payRef = useRef(pay);
  payRef.current = pay;

  // Al abrir: resetea los pagos y autocompleta "Efectivo recibido" con el total
  // (vuelto 0 por defecto → efectivo por el total sin tipear nada).
  useEffect(() => {
    if (!open) return;
    pay.reset();
    pay.setCashReceived(String(total));
  }, [open, total]); // eslint-disable-line react-hooks/exhaustive-deps

  // Foco al botón "Confirmar venta" al abrir (Enter = vender directo).
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      contentRef.current?.querySelector<HTMLButtonElement>("[data-confirm]")?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const getFocusables = useCallback(() => {
    const root = contentRef.current;
    if (!root) return [];
    return Array.from(
      root.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
      ),
    ).filter((el) => el.getClientRects().length > 0);
  }, []);

  // Roving focus + atajos del modal con escucha global en fase CAPTURE (misma
  // mecánica que el panel): ↑/↓ mueven el foco entre los controles; "+" agrega
  // el pago de la forma seleccionada con el monto autocompletado al saldo.
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (!contentRef.current || !contentRef.current.contains(active)) return;
      const isAdd = e.key === "+" || e.key === "=" || e.code === "NumpadAdd";
      if (isAdd) {
        const amt = parseFloat((payRef.current.amountInput || "").replace(",", "."));
        payRef.current.addPayment(Number.isFinite(amt) && amt > 0 ? amt : undefined);
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const els = getFocusables();
      const idx = els.indexOf(active as HTMLElement);
      if (idx < 0) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "ArrowDown" && idx < els.length - 1) els[idx + 1]?.focus();
      if (e.key === "ArrowUp" && idx > 0) els[idx - 1]?.focus();
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [open, getFocusables]);

  const handleConfirm = () => {
    confirmSale(pay.finalize(), cashSessionId, discountPct);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <div ref={contentRef} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Medio de pago</DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            Total a cobrar:{" "}
            <strong className="font-semibold tabular-nums">
              ${money(total)}
            </strong>
          </p>

          <PaymentSection
            idPrefix="modal-pay"
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

          <p className="text-xs text-muted-foreground">
            Usá <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">+</kbd> para
            agregar la forma de pago seleccionada ·{" "}
            <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">Enter</kbd> en
            "Confirmar venta" vende.
          </p>

          {pay.vuelto > 0 && (
            <div className="flex items-center justify-between rounded-lg bg-emerald-50 p-2 text-sm">
              <span>Vuelto</span>
              <span className="font-bold tabular-nums">${money(pay.vuelto)}</span>
            </div>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button data-confirm onClick={handleConfirm}>
              Confirmar venta
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};

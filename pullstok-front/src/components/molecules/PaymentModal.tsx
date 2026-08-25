import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { round2 } from "@/lib/money";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  type PaymentInput,
  type PaymentMethod,
} from "@/models/cashSessionModel";

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

type PayRow = { method: PaymentMethod; amount: string };

const money = (n: number) =>
  n.toLocaleString("es-AR", { minimumFractionDigits: 2 });

/**
 * Modal de pago del POS vendedor. Simple y rápido:
 * - Una fila por método de pago (efectivo, tarjeta, ...), numerada.
 * - La primera fila arranca en EFECTIVO con el monto precargado al total.
 * - "+" (botón o tecla) agrega otra forma; Enter también agrega una fila.
 * - ↑/↓ navegan entre los montos; las teclas 1..N saltan a editar esa fila.
 * - "VENDER" (o tecla V) confirma la venta.
 */
export const PaymentModal = ({
  open,
  onOpenChange,
  total,
  cashSessionId,
  discountPct,
  confirmSale,
}: PaymentModalProps) => {
  const [rows, setRows] = useState<PayRow[]>([{ method: "EFECTIVO", amount: "" }]);
  const contentRef = useRef<HTMLDivElement>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  // Al abrir: arranca con UNA fila (EFECTIVO) con el monto precargado al total.
  useEffect(() => {
    if (!open) return;
    setRows([{ method: "EFECTIVO", amount: String(total) }]);
  }, [open, total]);

  const sum = rows.reduce((s, r) => s + (parseFloat(r.amount.replace(",", ".")) || 0), 0);
  const remaining = round2(total - sum);

  const addRow = useCallback(() => {
    const nextMethod =
      PAYMENT_METHODS.find((m) => !rowsRef.current.some((r) => r.method === m)) ??
      "EFECTIVO";
    const nextAmount = String(rowsRef.current.length === 0 ? total : round2(total - sum));
    setRows((prev) => [...prev, { method: nextMethod, amount: nextAmount }]);
  }, [total]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateAmount = (i: number, v: string) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, amount: v } : r)));
  const updateMethod = (i: number, m: PaymentMethod) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, method: m } : r)));

  // Quita una fila; nunca deja el modal sin filas (siempre queda la primera).
  const removeRow = (i: number) =>
    setRows((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  const removeLastRow = () =>
    setRows((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));

  const focusRow = (i: number) => {
    const el = inputRefs.current[i];
    if (!el) return;
    el.focus();
    el.select();
  };

  const confirm = () => {
    const payments: PaymentInput[] = rows
      .map((r) => ({
        method: r.method,
        amount: round2(parseFloat(r.amount.replace(",", ".")) || 0),
      }))
      .filter((p) => p.amount > 0);
    const paid = round2(payments.reduce((s, p) => s + p.amount, 0));
    // Los pagos declarados deben sumar el total a cobrar; si no, se rechaza.
    if (Math.abs(paid - total) > 0.01) {
      toast.error(
        paid < total
          ? `Falta ${money(round2(total - paid))} para cubrir el total`
          : `Los pagos superan el total por ${money(round2(paid - total))}`,
      );
      return;
    }
    if (payments.length === 0) {
      toast.error("Ingresá al menos una forma de pago");
      return;
    }
    confirmSale(payments, cashSessionId, discountPct);
    onOpenChange(false);
  };

  // Teclado del modal (escucha global en fase CAPTURE, como el panel):
  // V vende, + agrega fila, 1..N saltan a editar esa fila, ↑/↓ navegan.
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (!contentRef.current || !contentRef.current.contains(active)) return;

      if (e.key === "v" || e.key === "V") {
        e.preventDefault();
        e.stopPropagation();
        confirm();
        return;
      }
      const isAdd = e.key === "+" || e.key === "=" || e.code === "NumpadAdd";
      if (isAdd) {
        e.preventDefault();
        e.stopPropagation();
        addRow();
        return;
      }
      // "-": quita la última forma de pago (hasta que quede solo la primera).
      const isRemove = e.key === "-" || e.code === "NumpadSubtract";
      if (isRemove) {
        e.preventDefault();
        e.stopPropagation();
        removeLastRow();
        return;
      }
      // Teclas 1..N: saltar a editar esa fila (solo cuando no se está tipeando
      // en un input, para que los dígitos del monto no se intercepten).
      if (/^[1-9]$/.test(e.key) && !(active instanceof HTMLInputElement)) {
        const idx = Number(e.key) - 1;
        if (idx < rowsRef.current.length) {
          e.preventDefault();
          e.stopPropagation();
          focusRow(idx);
        }
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const root = contentRef.current;
      const els = Array.from(
        root.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
        ),
      ).filter((el) => el.getClientRects().length > 0);
      const idx = els.indexOf(active as HTMLElement);
      if (idx < 0) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "ArrowDown" && idx < els.length - 1) els[idx + 1]?.focus();
      if (e.key === "ArrowUp" && idx > 0) els[idx - 1]?.focus();
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <div ref={contentRef} className="space-y-4 text-center">
          <DialogTitle className="text-center text-lg font-semibold">
            MEDIO DE PAGO
          </DialogTitle>

          {/* ── Filas de método + monto ── */}
          <div className="space-y-2">
            {rows.map((row, i) => (
              <div key={i} className="flex items-center justify-center gap-2">
                <span className="w-4 text-right text-sm font-semibold text-muted-foreground">
                  {i + 1}
                </span>
                <NativeSelect
                  value={row.method}
                  onValueChange={(v) => updateMethod(i, v as PaymentMethod)}
                  options={PAYMENT_METHODS.map((m) => ({
                    value: m,
                    label: PAYMENT_METHOD_LABELS[m],
                  }))}
                />
                <Input
                  ref={(el) => {
                    inputRefs.current[i] = el;
                  }}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={row.amount}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => updateAmount(i, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      e.stopPropagation();
                      addRow();
                    }
                  }}
                  className="w-28 text-right"
                  placeholder="0"
                />
                {rows.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground"
                    onClick={() => removeRow(i)}
                    aria-label={`Quitar forma de pago ${i + 1}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          {/* ── Agregar otra forma de pago ── */}
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={addRow}
            disabled={remaining <= 0}
          >
            <Plus className="h-4 w-4" /> Agregar forma de pago
          </Button>

          {/* ── Total a cobrar ── */}
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">total a cobrar</p>
            <p className="text-3xl font-bold tabular-nums">${money(total)}</p>
          </div>

          {/* ── Vender ── */}
          <Button className="w-full" size="lg" onClick={confirm}>
            VENDER
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

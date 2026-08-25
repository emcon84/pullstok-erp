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

const parseAmt = (v: string) => parseFloat(v.replace(",", ".")) || 0;

/**
 * Modal de pago del POS vendedor.
 * - La primera fila (EFECTIVO) es el "saldo": se recalcula sola como
 *   total − suma de las demás formas; es de solo lectura.
 * - "+" (botón o tecla) agrega otra forma; el foco va al SELECT nuevo, y al
 *   elegir el método pasa al INPUT de esa fila para cargar el monto.
 * - Enter agrega una fila; "-" quita la última; 1..N saltan a editar una fila;
 *   ↑/↓ navegan; "V" (o VENDER) confirma (si el total encaja).
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
  // Índice de la fila cuyo SELECT hay que enfocar tras agregarla.
  const pendingSelectFocus = useRef<number | null>(null);

  // Al abrir: arranca con UNA fila (EFECTIVO) por el total.
  useEffect(() => {
    if (!open) return;
    setRows([{ method: "EFECTIVO", amount: String(total) }]);
  }, [open, total]);

  // Saldo de la primera fila: total − suma de los métodos adicionales.
  const extrasSum = rows
    .slice(1)
    .reduce((s, r) => s + parseAmt(r.amount), 0);
  const balance = round2(total - extrasSum);

  const addRow = useCallback(() => {
    const cur = rowsRef.current;
    const nextMethod =
      PAYMENT_METHODS.find((m) => !cur.some((r) => r.method === m)) ?? "EFECTIVO";
    setRows((prev) => [...prev, { method: nextMethod, amount: "" }]);
    pendingSelectFocus.current = cur.length; // índice de la fila nueva
  }, []);

  const updateAmount = (i: number, v: string) =>
    setRows((prev) =>
      prev.map((r, idx) => (idx === i ? { ...r, amount: v } : r)),
    );

  const updateMethod = (i: number, m: PaymentMethod) => {
    setRows((prev) =>
      prev.map((r, idx) => (idx === i ? { ...r, method: m } : r)),
    );
    // Al elegir el método, foco al input de esa fila para cargar el monto.
    const el = inputRefs.current[i];
    el?.focus();
    el?.select();
  };

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
    const cur = rowsRef.current;
    const extras = cur.slice(1).map((r) => ({
      method: r.method,
      amount: round2(parseAmt(r.amount)),
    }));
    const extrasSumNow = round2(extras.reduce((s, p) => s + p.amount, 0));
    const bal = round2(total - extrasSumNow);
    const payments: PaymentInput[] = [
      { method: cur[0].method, amount: Math.max(0, bal) },
      ...extras.filter((p) => p.amount > 0),
    ];
    const paid = round2(payments.reduce((s, p) => s + p.amount, 0));
    if (Math.abs(paid - total) > 0.01) {
      toast.error(
        paid < total
          ? `Falta ${money(round2(total - paid))} para cubrir el total`
          : `Los pagos superan el total por ${money(round2(paid - total))}`,
      );
      return;
    }
    confirmSale(payments, cashSessionId, discountPct);
    onOpenChange(false);
  };

  // Handlers más recientes para la escucha global (que no se re-registra).
  const handlersRef = useRef({ confirm, addRow, removeLastRow, removeRow, focusRow });
  handlersRef.current = { confirm, addRow, removeLastRow, removeRow, focusRow };

  // Tras agregar una fila, foco al SELECT nuevo.
  useEffect(() => {
    if (pendingSelectFocus.current === null) return;
    const idx = pendingSelectFocus.current;
    pendingSelectFocus.current = null;
    const el = contentRef.current?.querySelector<HTMLElement>(
      `[data-pay-select="${idx}"] button, [data-pay-select="${idx}"] select`,
    );
    el?.focus();
  }, [rows]);

  // Teclado del modal (escucha global en fase CAPTURE, como el panel):
  // V vende, + agrega fila, - quita la última, 1..N saltan a editar, ↑/↓ navegan.
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (!contentRef.current || !contentRef.current.contains(active)) return;

      if (e.key === "v" || e.key === "V") {
        e.preventDefault();
        e.stopPropagation();
        handlersRef.current.confirm();
        return;
      }
      const isAdd = e.key === "+" || e.key === "=" || e.code === "NumpadAdd";
      if (isAdd) {
        e.preventDefault();
        e.stopPropagation();
        handlersRef.current.addRow();
        return;
      }
      const isRemove = e.key === "-" || e.code === "NumpadSubtract";
      if (isRemove) {
        e.preventDefault();
        e.stopPropagation();
        handlersRef.current.removeLastRow();
        return;
      }
      // Teclas 1..N: saltar a editar esa fila (solo cuando no se está tipeando).
      if (/^[1-9]$/.test(e.key) && !(active instanceof HTMLInputElement)) {
        const idx = Number(e.key) - 1;
        if (idx < rowsRef.current.length) {
          e.preventDefault();
          e.stopPropagation();
          handlersRef.current.focusRow(idx);
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
                <div data-pay-select={i} className="flex-1 min-w-0">
                  <NativeSelect
                    value={row.method}
                    onValueChange={(v) => updateMethod(i, v as PaymentMethod)}
                    options={PAYMENT_METHODS.map((m) => ({
                      value: m,
                      label: PAYMENT_METHOD_LABELS[m],
                    }))}
                  />
                </div>
                <Input
                  ref={(el) => {
                    inputRefs.current[i] = el;
                  }}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={i === 0 ? String(balance) : row.amount}
                  readOnly={i === 0}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => updateAmount(i, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      e.stopPropagation();
                      handlersRef.current.addRow();
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
            disabled={balance <= 0}
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

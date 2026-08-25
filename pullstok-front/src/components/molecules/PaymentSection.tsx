import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { round2 } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
  type PaymentInput,
} from "@/models/cashSessionModel";

interface PaymentSectionProps {
  /** Prefijo de ids para no chocar entre componentes montados (p. ej. "pay"). */
  idPrefix: string;
  payments: PaymentInput[];
  selectedMethod: PaymentMethod;
  setSelectedMethod: (m: PaymentMethod) => void;
  cashReceived: string;
  setCashReceived: (v: string) => void;
  addPayment: (amount?: number) => void;
  clearPayments: () => void;
  total: number;
  /** Monto a declarar (opcional). Si viene, se muestra editable y
   *  autocompletado con el saldo; permite DESGLOSAR en varias formas. */
  amountInput?: string;
  setAmountInput?: (v: string) => void;
  /** Clases extra del contenedor (p. ej. "mb-4" en SalesDrawer). */
  className?: string;
}

/**
 * Sección presentacional de medios de pago (sdd/caja-apertura-cierre R6-R8,
 * R10): selector de método, monto a declarar (desglose), efectivo recibido,
 * agregar pago del saldo, desglose de payments con "Total pagado" y "Limpiar".
 * Reutilizada por el POS (VendorCartSheet / VendorOrderPanel), el SalesDrawer y
 * las ventas directas. Stateless: recibe todo por props, la lógica vive en
 * usePayments.
 */
export const PaymentSection = ({
  idPrefix,
  payments,
  selectedMethod,
  setSelectedMethod,
  cashReceived,
  setCashReceived,
  addPayment,
  clearPayments,
  total,
  amountInput,
  setAmountInput,
  className,
}: PaymentSectionProps) => {
  const sum = round2(payments.reduce((s, p) => s + p.amount, 0));
  const remaining = round2(total - sum);
  const methodId = `${idPrefix}-method`;
  const cashId = `${idPrefix}-cash`;
  const amountId = `${idPrefix}-amount`;

  const parseAmt = (s: string) => parseFloat(s.replace(",", "."));

  const amountOk =
    amountInput !== undefined && !Number.isNaN(parseAmt(amountInput))
      ? parseAmt(amountInput) > 0
      : true;
  const canAdd = remaining > 0 && amountOk;

  const handleAdd = () => {
    const amt = parseAmt(amountInput ?? "");
    if (amountInput !== undefined && !Number.isNaN(amt) && amt > 0) {
      addPayment(amt);
    } else {
      addPayment();
    }
  };

  return (
    <div className={cn("space-y-3 rounded-lg bg-muted/40 p-3", className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Medio de pago</span>
        {payments.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clearPayments}>
            Limpiar
          </Button>
        )}
      </div>

      <div className="flex gap-2">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor={methodId}>Método</Label>
          <NativeSelect
            id={methodId}
            value={selectedMethod}
            onValueChange={(v) => setSelectedMethod(v as PaymentMethod)}
            options={PAYMENT_METHODS.map((m) => ({
              value: m,
              label: PAYMENT_METHOD_LABELS[m],
            }))}
          />
        </div>
        {amountInput !== undefined && setAmountInput && (
          <div className="flex-1 space-y-1.5">
            <Label htmlFor={amountId}>Monto</Label>
            <Input
              id={amountId}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={amountInput}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => setAmountInput(e.target.value)}
              className="text-right"
            />
          </div>
        )}
      </div>

      <div className="flex-1 space-y-1.5">
        <Label htmlFor={cashId}>Efectivo recibido</Label>
        <Input
          id={cashId}
          type="number"
          min={0}
          step="0.01"
          placeholder={total.toFixed(2)}
          value={cashReceived}
          onChange={(e) => setCashReceived(e.target.value)}
        />
      </div>

      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={handleAdd}
        disabled={!canAdd}
      >
        Agregar pago ({PAYMENT_METHOD_LABELS[selectedMethod]})
      </Button>

      {payments.length > 0 && (
        <div className="space-y-1 text-sm">
          {payments.map((p, i) => (
            <div key={i} className="flex items-center justify-between">
              <span>{PAYMENT_METHOD_LABELS[p.method]}</span>
              <span className="tabular-nums">
                ${p.amount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between border-t pt-1 font-semibold">
            <span>Total pagado</span>
            <span className="tabular-nums">
              ${sum.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex items-center justify-between text-muted-foreground">
            <span>Falta</span>
            <span className="tabular-nums">
              ${remaining.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

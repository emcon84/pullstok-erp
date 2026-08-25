import { useEffect, useState } from "react";
import { round2 } from "@/lib/money";
import type { PaymentInput, PaymentMethod } from "@/models/cashSessionModel";

/**
 * Medios de pago (sdd/caja-apertura-cierre R6-R8, R10): estado compartido del
 * selector de método + vuelto + monto a declarar. Reemplaza la lógica duplicada
 * que vivía en VendorCartSheet y SalesDrawer, y se reutiliza en las ventas
 * directas (QuantityModal / PriceKgProductPanel).
 *
 * payments[] es el payload a persistir (suma el total — R7); cashReceived es un
 * input auxiliar para calcular el vuelto (solo EFECTIVO, NO se persiste — R10).
 *
 * amountInput es el MONTO a declarar en la forma seleccionada: se autocompleta
 * con el saldo restante (default: el total) y permite DESGLOSAR el pago en
 * varias formas (efectivo + tarjeta + ...) sumando el total.
 */
export function usePayments(total: number) {
  const [payments, setPayments] = useState<PaymentInput[]>([]);
  const [cashReceived, setCashReceived] = useState("");
  const [amountInput, setAmountInput] = useState<string>("");
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>("EFECTIVO");

  const received = Number(cashReceived) || 0;
  const vuelto = round2(received - total);

  const sum = () => round2(payments.reduce((s, p) => s + p.amount, 0));
  const remaining = round2(total - sum());

  // Autocompleta el monto a declarar con el saldo restante (default: total).
  useEffect(() => {
    setAmountInput(String(remaining > 0 ? remaining : 0));
  }, [remaining]);

  const addPayment = (amount?: number) => {
    const want = amount !== undefined ? round2(amount) : remaining;
    const toAdd = Math.min(want, remaining);
    if (toAdd <= 0) return;
    setPayments((prev) => {
      const existing = prev.find((p) => p.method === selectedMethod);
      if (existing) {
        return prev.map((p) =>
          p.method === selectedMethod
            ? { ...p, amount: round2(p.amount + toAdd) }
            : p,
        );
      }
      return [...prev, { method: selectedMethod, amount: toAdd }];
    });
  };

  const clearPayments = () => {
    setPayments([]);
    setCashReceived("");
    setAmountInput("");
  };

  // Payload final: los payments declarados deben sumar el total (R7). Si no se
  // declaró nada, se declara EFECTIVO por el total. El vuelto (recibido - total)
  // NO se persiste — R10.
  const finalize = (): PaymentInput[] =>
    payments.length === 0
      ? [{ method: "EFECTIVO", amount: round2(total) }]
      : payments;

  const reset = () => {
    setPayments([]);
    setCashReceived("");
    setAmountInput("");
  };

  return {
    payments,
    cashReceived,
    setCashReceived,
    amountInput,
    setAmountInput,
    selectedMethod,
    setSelectedMethod,
    received,
    vuelto,
    remaining,
    sum,
    addPayment,
    clearPayments,
    finalize,
    reset,
  };
}

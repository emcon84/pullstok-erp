import { useState } from "react";
import { round2 } from "@/lib/money";
import type { PaymentInput, PaymentMethod } from "@/models/cashSessionModel";

/**
 * Medios de pago (sdd/caja-apertura-cierre R6-R8, R10): estado compartido del
 * selector de método + vuelto. Reemplaza la lógica duplicada que vivía en
 * VendorCartSheet y SalesDrawer, y se reutiliza en las ventas directas
 * (QuantityModal / PriceKgProductPanel).
 *
 * payments[] es el payload a persistir (suma el total — R7); cashReceived es un
 * input auxiliar para calcular el vuelto (solo EFECTIVO, NO se persiste — R10).
 */
export function usePayments(total: number) {
  const [payments, setPayments] = useState<PaymentInput[]>([]);
  const [cashReceived, setCashReceived] = useState("");
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>("EFECTIVO");

  const received = Number(cashReceived) || 0;
  const vuelto = round2(received - total);

  const sum = () => round2(payments.reduce((s, p) => s + p.amount, 0));

  const addPayment = () => {
    // Declara en el método seleccionado el saldo que falta para cubrir el total.
    const remaining = round2(total - sum());
    if (remaining <= 0) return;
    setPayments((prev) => {
      const existing = prev.find((p) => p.method === selectedMethod);
      if (existing) {
        return prev.map((p) =>
          p.method === selectedMethod
            ? { ...p, amount: round2(p.amount + remaining) }
            : p,
        );
      }
      return [...prev, { method: selectedMethod, amount: remaining }];
    });
  };

  const clearPayments = () => {
    setPayments([]);
    setCashReceived("");
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
  };

  return {
    payments,
    cashReceived,
    setCashReceived,
    selectedMethod,
    setSelectedMethod,
    received,
    vuelto,
    sum,
    addPayment,
    clearPayments,
    finalize,
    reset,
  };
}

/**
 * Caja (sdd/caja-apertura-cierre) — modelo de dominio del frontend.
 *
 * Espeja el contrato backend (api/src/services/cashSessionService.ts):
 * CashSession es un modelo tenant con payments (SalePayment[]), y el cierre
 * (closeCash) devuelve { expectedAmount, closingAmount, difference }.
 */

export type PaymentMethod =
  | "EFECTIVO"
  | "TARJETA_CREDITO"
  | "TARJETA_DEBITO"
  | "TRANSFERENCIA"
  | "QR";

export type CashSessionStatus = "OPEN" | "CLOSED";

/** Métodos de pago disponibles para el selector de checkout y el arqueo. */
export const PAYMENT_METHODS: PaymentMethod[] = [
  "EFECTIVO",
  "TARJETA_CREDITO",
  "TARJETA_DEBITO",
  "TRANSFERENCIA",
  "QR",
];

/** Nombres visibles (UI en español) por método. */
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  EFECTIVO: "Efectivo",
  TARJETA_CREDITO: "Tarjeta de crédito",
  TARJETA_DEBITO: "Tarjeta de débito",
  TRANSFERENCIA: "Transferencia",
  QR: "QR",
};

/** Un pago declarado en una venta (SalePayment persistido). */
export interface SalePayment {
  id?: string;
  saleId?: string;
  method: PaymentMethod;
  amount: number;
  cashSessionId?: string | null;
  createdAt?: string;
}

/** Declaración de un medio de pago enviada en el payload de una venta. */
export interface PaymentInput {
  method: PaymentMethod;
  amount: number;
}

export interface CashSession {
  id: string;
  branchId: string;
  cashierId: string;
  organizationId: string;
  openedAt: string;
  closedAt?: string | null;
  openingAmount: number;
  expectedAmount?: number | null;
  closingAmount?: number | null;
  closingByMethod?: Record<string, number> | null;
  status: CashSessionStatus;
  observations?: string | null;
  createdAt: string;
  updatedAt: string;
  /** SalePayment[] incluidos por el backend (getCurrent/getOne/list). */
  payments?: SalePayment[];
}

/** Respuesta del cierre (closeCash): esperado, contado y diferencia. */
export interface CashCloseResult {
  expectedAmount: number;
  closingAmount: number;
  difference: number;
}

/** Payload de apertura de caja. */
export interface OpenCashPayload {
  branchId?: string;
  openingAmount?: number;
  observations?: string;
}

/** Payload de cierre/arqueo. */
export interface CloseCashPayload {
  closingByMethod: Record<string, number>;
  closingAmount?: number;
  observations?: string;
}

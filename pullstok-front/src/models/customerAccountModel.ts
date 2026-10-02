import type { PaymentMethod } from "./cashSessionModel";

/**
 * Cuenta corriente de clientes — espeja el contrato backend
 * (api/src/services/customerAccountService.ts). Saldo = Σ CHARGE − Σ PAYMENT:
 * saldo > 0 = el cliente debe plata; saldo < 0 = saldo a favor.
 */

export type AccountMovementType = "CHARGE" | "PAYMENT";

export interface AccountMovement {
  id: string;
  type: AccountMovementType;
  amount: number;
  /** Venta que originó el cargo (solo CHARGE). */
  saleId?: string | null;
  /** Medio con el que se cobró (solo PAYMENT). */
  method?: PaymentMethod | null;
  cashSessionId?: string | null;
  note?: string | null;
  createdAt: string;
}

/** Fila de GET /customers/balances (solo clientes con saldo != 0). */
export interface CustomerBalance {
  customerId: string;
  name: string;
  balance: number;
}

/** Respuesta de GET /customers/:id/account (movimientos: más nuevos primero). */
export interface CustomerAccount {
  customer: { id: string; name: string };
  balance: number;
  movements: AccountMovement[];
}

/** Payload de POST /customers/:id/account/payments (cobranza). */
export interface AccountPaymentInput {
  amount: number;
  /** Nunca CUENTA_CORRIENTE. */
  method: PaymentMethod;
  /** Obligatorio con EFECTIVO: id de la caja OPEN. */
  cashSessionId?: string;
  /** ISO; no futura. Sin fecha = ahora. */
  date?: string;
  note?: string;
}

export interface AccountPaymentResult {
  movement: AccountMovement;
  /** Saldo restante tras la cobranza. */
  balance: number;
}

/** Payload de POST /customers/:id/account/charges (deuda anterior, sin venta). */
export interface AccountChargeInput {
  /** > 0, máx. 2 decimales. */
  amount: number;
  /** ISO; no futura. Sin fecha = ahora. */
  date?: string;
  /** Detalle libre (máx. 500). */
  note?: string;
}

export interface AccountChargeResult {
  movement: AccountMovement;
  /** Saldo total tras el cargo. */
  balance: number;
}

/** Respuesta de POST /customers/:id/account/statement-link (fallback wa.me
 *  mientras Kapso está en sandbox — el front arma el link wa.me con esta url). */
export interface AccountStatementLink {
  url: string;
  filename: string;
}

/** Payload de PATCH /customers/:id/account/movements/:movementId (solo editables:
 *  deuda anterior y cobranza; el método de una cobranza no se edita). */
export interface AccountMovementUpdateInput {
  amount?: number;
  /** ISO; no futura. */
  date?: string;
  note?: string;
}

export interface AccountMovementUpdateResult {
  movement: AccountMovement;
  /** Saldo total tras la edición. */
  balance: number;
}

export interface AccountMovementDeleteResult {
  deletedId: string;
  /** Saldo total tras el borrado. */
  balance: number;
}

export interface TopDebtor extends CustomerBalance {
  /** Fraction (0..1) of the total debt owed by this customer. */
  share: number;
}

/** Respuesta de GET /customers/balances/summary (needs the X-Balances-Token). */
export interface BalancesSummary {
  /** Sum of positive balances (money customers owe us). */
  totalOwed: number;
  /** Absolute sum of negative balances (credit in the customers favor). */
  totalCredit: number;
  /** totalOwed - totalCredit. */
  net: number;
  debtorCount: number;
  creditorCount: number;
  topDebtors: TopDebtor[];
}

/** Respuesta de POST /customers/balances/unlock. */
export interface BalancesUnlockResult {
  token: string;
  expiresInSec: number;
}

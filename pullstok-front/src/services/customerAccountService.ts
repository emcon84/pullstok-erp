import axios from "axios";
import { API_URL } from "../constants";
import type {
  AccountCollections,
  AccountMovementDeleteResult,
  AccountMovementUpdateInput,
  AccountMovementUpdateResult,
  AccountChargeInput,
  AccountChargeResult,
  AccountPaymentInput,
  AccountPaymentResult,
  AccountStatementLink,
  BalancesSummary,
  BalancesUnlockResult,
  CustomerAccount,
  CustomerBalance,
} from "../models/customerAccountModel";

/**
 * Cuenta corriente de clientes: saldos, extracto y cobranzas
 * (api/src/routes/customerRoutes.ts).
 */

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("token")}`,
});

const toError = (error: unknown, fallback: string): Error => {
  if (axios.isAxiosError(error)) {
    return new Error(error.response?.data?.message || fallback);
  }
  return new Error(fallback);
};

/** Clientes con saldo != 0 (deudores y con saldo a favor), ordenados por nombre. */
export const getCustomerBalances = async (): Promise<CustomerBalance[]> => {
  try {
    const response = await axios.get<CustomerBalance[]>(`${API_URL}/customers/balances`, {
      headers: authHeaders(),
    });
    return response.data;
  } catch (error) {
    throw toError(error, "Error al obtener los saldos");
  }
};

/**
 * Cobros de cuenta corriente en [from, to) agrupados por medio de pago
 * (solo ADMIN/MANAGEMENT; alimenta Estadísticas → Ventas).
 */
export const getAccountCollections = async (from: Date, to: Date): Promise<AccountCollections> => {
  try {
    const response = await axios.get<AccountCollections>(`${API_URL}/customers/account-collections`, {
      headers: authHeaders(),
      params: { from: from.toISOString(), to: to.toISOString() },
    });
    return response.data;
  } catch (error) {
    throw toError(error, "Error al obtener los cobros de cuenta corriente");
  }
};

/** Error that keeps the server domain code (e.g. BALANCES_LOCKED). */
export class BalancesApiError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

const toBalancesError = (error: unknown, fallback: string): BalancesApiError => {
  if (axios.isAxiosError(error)) {
    return new BalancesApiError(
      error.response?.data?.message || fallback,
      error.response?.data?.error,
    );
  }
  return new BalancesApiError(fallback);
};

/** Exchanges the balances password for a short-lived token (kept in memory only). */
export const unlockBalancesView = async (password: string): Promise<BalancesUnlockResult> => {
  try {
    const response = await axios.post<BalancesUnlockResult>(
      `${API_URL}/customers/balances/unlock`,
      { password },
      { headers: authHeaders() },
    );
    return response.data;
  } catch (error) {
    throw toBalancesError(error, "No se pudo verificar la contraseña");
  }
};

/** Company-wide totals + top debtors; the server requires the unlock token. */
export const getBalancesSummary = async (token: string): Promise<BalancesSummary> => {
  try {
    const response = await axios.get<BalancesSummary>(`${API_URL}/customers/balances/summary`, {
      headers: { ...authHeaders(), "X-Balances-Token": token },
    });
    return response.data;
  } catch (error) {
    throw toBalancesError(error, "Error al obtener el resumen de saldos");
  }
};

/** Extracto de un cliente: saldo + movimientos (más nuevos primero). */
export const getCustomerAccount = async (customerId: string): Promise<CustomerAccount> => {
  try {
    const response = await axios.get<CustomerAccount>(
      `${API_URL}/customers/${customerId}/account`,
      { headers: authHeaders() },
    );
    return response.data;
  } catch (error) {
    throw toError(error, "Error al obtener la cuenta corriente");
  }
};

/** Registra una cobranza. El servidor rechaza sobrepagos y EFECTIVO sin caja abierta. */
export const registerAccountPayment = async (
  customerId: string,
  input: AccountPaymentInput,
): Promise<AccountPaymentResult> => {
  try {
    const response = await axios.post<AccountPaymentResult>(
      `${API_URL}/customers/${customerId}/account/payments`,
      input,
      { headers: authHeaders() },
    );
    return response.data;
  } catch (error) {
    throw toError(error, "Error al registrar la cobranza");
  }
};

/** Carga una deuda anterior (cargo sin venta: no toca stock ni caja). */
export const createHistoricalCharge = async (
  customerId: string,
  input: AccountChargeInput,
): Promise<AccountChargeResult> => {
  try {
    const response = await axios.post<AccountChargeResult>(
      `${API_URL}/customers/${customerId}/account/charges`,
      input,
      { headers: authHeaders() },
    );
    return response.data;
  } catch (error) {
    throw toError(error, "Error al cargar la deuda anterior");
  }
};

/** Edita un movimiento (deuda anterior o cobranza). El servidor rechaza los
 *  inmutables y los de caja cerrada. */
export const updateAccountMovement = async (
  customerId: string,
  movementId: string,
  input: AccountMovementUpdateInput,
): Promise<AccountMovementUpdateResult> => {
  try {
    const response = await axios.patch<AccountMovementUpdateResult>(
      `${API_URL}/customers/${customerId}/account/movements/${movementId}`,
      input,
      { headers: authHeaders() },
    );
    return response.data;
  } catch (error) {
    throw toError(error, "Error al editar el movimiento");
  }
};

/** Borra un movimiento (mismas reglas que la edición). */
export const deleteAccountMovement = async (
  customerId: string,
  movementId: string,
): Promise<AccountMovementDeleteResult> => {
  try {
    const response = await axios.delete<AccountMovementDeleteResult>(
      `${API_URL}/customers/${customerId}/account/movements/${movementId}`,
      { headers: authHeaders() },
    );
    return response.data;
  } catch (error) {
    throw toError(error, "Error al borrar el movimiento");
  }
};

/** Envía el PDF de resumen de cuenta por WhatsApp al teléfono del cliente
 *  (sin body: el servidor arma el PDF con la cuenta actual). Errores de
 *  dominio (sin teléfono, falla de WhatsApp) llegan en `message`. */
export const sendAccountStatementWhatsapp = async (
  customerId: string,
): Promise<{ sent: true }> => {
  try {
    const response = await axios.post<{ sent: true }>(
      `${API_URL}/customers/${customerId}/account/statement/whatsapp`,
      undefined,
      { headers: authHeaders() },
    );
    return response.data;
  } catch (error) {
    throw toError(error, "Error al enviar el comprobante por WhatsApp");
  }
};

/** Arma el PDF de resumen de cuenta y devuelve su URL pública (sin exigir
 *  teléfono ni pasar por Kapso): fallback wa.me mientras Kapso está en
 *  sandbox — ver `sendAccountStatementWhatsapp`, que queda dormant. */
export const getAccountStatementLink = async (
  customerId: string,
): Promise<AccountStatementLink> => {
  try {
    const response = await axios.post<AccountStatementLink>(
      `${API_URL}/customers/${customerId}/account/statement-link`,
      undefined,
      { headers: authHeaders() },
    );
    return response.data;
  } catch (error) {
    throw toError(error, "Error al generar el resumen de cuenta");
  }
};

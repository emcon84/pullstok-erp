import axios from "axios";
import { API_URL } from "../constants";
import type {
  AccountPaymentInput,
  AccountPaymentResult,
  AccountStatementLink,
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

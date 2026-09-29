import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createHistoricalCharge,
  getAccountStatementLink,
  getCustomerAccount,
  getCustomerBalances,
  registerAccountPayment,
  sendAccountStatementWhatsapp,
} from "../../services/customerAccountService";
import type {
  AccountChargeInput,
  AccountChargeResult,
  AccountPaymentInput,
  AccountPaymentResult,
  AccountStatementLink,
  CustomerAccount,
  CustomerBalance,
} from "../../models/customerAccountModel";

/** Saldos de todos los clientes con deuda / saldo a favor. */
export const useCustomerBalances = () => {
  const { data, error, isLoading } = useQuery<CustomerBalance[], Error>({
    queryKey: ["customer-balances"],
    queryFn: getCustomerBalances,
  });
  return { balances: data ?? [], loading: isLoading, error };
};

/** Extracto de un cliente (deshabilitado sin id). */
export const useCustomerAccount = (customerId: string) => {
  const { data, error, isLoading } = useQuery<CustomerAccount, Error>({
    queryKey: ["customer-account", customerId],
    queryFn: () => getCustomerAccount(customerId),
    enabled: !!customerId,
  });
  return { account: data ?? null, loading: isLoading, error };
};

/** Cobranza: al terminar refresca el extracto, los saldos y la caja (EFECTIVO). */
export const useRegisterAccountPayment = () => {
  const queryClient = useQueryClient();
  const mutation = useMutation<
    AccountPaymentResult,
    Error,
    { customerId: string; input: AccountPaymentInput }
  >({
    mutationFn: ({ customerId, input }) => registerAccountPayment(customerId, input),
    onSuccess: (_result, { customerId }) => {
      queryClient.invalidateQueries({ queryKey: ["customer-account", customerId] });
      queryClient.invalidateQueries({ queryKey: ["customer-balances"] });
      queryClient.invalidateQueries({ queryKey: ["cash-sessions"] });
    },
  });
  return {
    registerPayment: mutation.mutate,
    registerPaymentAsync: mutation.mutateAsync,
    loading: mutation.isPending,
  };
};

/** Deuda anterior: refresca el extracto y los saldos. NO invalida la caja: un
 *  cargo histórico no mueve plata en el arqueo. */
export const useCreateHistoricalCharge = () => {
  const queryClient = useQueryClient();
  const mutation = useMutation<
    AccountChargeResult,
    Error,
    { customerId: string; input: AccountChargeInput }
  >({
    mutationFn: ({ customerId, input }) => createHistoricalCharge(customerId, input),
    onSuccess: (_result, { customerId }) => {
      queryClient.invalidateQueries({ queryKey: ["customer-account", customerId] });
      queryClient.invalidateQueries({ queryKey: ["customer-balances"] });
    },
  });
  return {
    createCharge: mutation.mutate,
    createChargeAsync: mutation.mutateAsync,
    loading: mutation.isPending,
  };
};

/** Envía el comprobante de cuenta corriente por WhatsApp vía Kapso. EN
 *  SANDBOX Kapso rechaza el envío (403, requiere sesión activa) — queda
 *  dormant, disponible para cuando la cuenta pase a producción. El botón del
 *  front usa `useGetAccountStatementLink` mientras tanto. No invalida nada:
 *  enviar el PDF no cambia el saldo ni los movimientos. */
export const useSendAccountStatementWhatsapp = () => {
  const mutation = useMutation<{ sent: true }, Error, string>({
    mutationFn: (customerId) => sendAccountStatementWhatsapp(customerId),
  });
  return {
    sendStatement: mutation.mutate,
    sendStatementAsync: mutation.mutateAsync,
    loading: mutation.isPending,
  };
};

/** Arma el PDF de resumen de cuenta y devuelve su URL pública (sin exigir
 *  teléfono ni pasar por Kapso): fallback wa.me mientras Kapso está en
 *  sandbox. No invalida nada: no cambia saldo ni movimientos. */
export const useGetAccountStatementLink = () => {
  const mutation = useMutation<AccountStatementLink, Error, string>({
    mutationFn: (customerId) => getAccountStatementLink(customerId),
  });
  return {
    getStatementLink: mutation.mutate,
    getStatementLinkAsync: mutation.mutateAsync,
    loading: mutation.isPending,
  };
};

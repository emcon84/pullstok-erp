import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getCustomerAccount,
  getCustomerBalances,
  registerAccountPayment,
  sendAccountStatementWhatsapp,
} from "../../services/customerAccountService";
import type {
  AccountPaymentInput,
  AccountPaymentResult,
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

/** Envía el comprobante de cuenta corriente por WhatsApp. No invalida nada:
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

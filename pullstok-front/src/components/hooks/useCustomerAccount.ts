import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createHistoricalCharge,
  getAccountCollections,
  deleteAccountMovement,
  getAccountStatementLink,
  getCustomerAccount,
  getCustomerBalances,
  registerAccountPayment,
  sendAccountStatementWhatsapp,
  updateAccountMovement,
} from "../../services/customerAccountService";
import type {
  AccountCollections,
  AccountChargeInput,
  AccountChargeResult,
  AccountMovementDeleteResult,
  AccountMovementUpdateInput,
  AccountMovementUpdateResult,
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

/** Cobros de cuenta corriente por medio de pago en [from, to); conserva el dato previo al cambiar el rango. */
export const useAccountCollections = (from: Date, to: Date, enabled = true) => {
  const { data, error, isLoading } = useQuery<AccountCollections, Error>({
    queryKey: ["account-collections", from.toISOString(), to.toISOString()],
    queryFn: () => getAccountCollections(from, to),
    enabled,
    placeholderData: (prev) => prev,
  });
  return { collections: data ?? null, loading: isLoading, error };
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
      queryClient.invalidateQueries({ queryKey: ["balances-summary"] });
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
      queryClient.invalidateQueries({ queryKey: ["balances-summary"] });
    },
  });
  return {
    createCharge: mutation.mutate,
    createChargeAsync: mutation.mutateAsync,
    loading: mutation.isPending,
  };
};

/** Refresca extracto, saldos y caja: editar/borrar una cobranza en EFECTIVO
 *  mueve el arqueo de su caja. */
const invalidateAccountQueries = (
  queryClient: ReturnType<typeof useQueryClient>,
  customerId: string,
) => {
  queryClient.invalidateQueries({ queryKey: ["customer-account", customerId] });
  queryClient.invalidateQueries({ queryKey: ["customer-balances"] });
  queryClient.invalidateQueries({ queryKey: ["balances-summary"] });
  queryClient.invalidateQueries({ queryKey: ["cash-sessions"] });
};

/** Edita un movimiento (deuda anterior o cobranza). */
export const useUpdateAccountMovement = () => {
  const queryClient = useQueryClient();
  const mutation = useMutation<
    AccountMovementUpdateResult,
    Error,
    { customerId: string; movementId: string; input: AccountMovementUpdateInput }
  >({
    mutationFn: ({ customerId, movementId, input }) =>
      updateAccountMovement(customerId, movementId, input),
    onSuccess: (_result, { customerId }) => invalidateAccountQueries(queryClient, customerId),
  });
  return {
    updateMovement: mutation.mutate,
    updateMovementAsync: mutation.mutateAsync,
    loading: mutation.isPending,
  };
};

/** Borra un movimiento (deuda anterior o cobranza). */
export const useDeleteAccountMovement = () => {
  const queryClient = useQueryClient();
  const mutation = useMutation<
    AccountMovementDeleteResult,
    Error,
    { customerId: string; movementId: string }
  >({
    mutationFn: ({ customerId, movementId }) => deleteAccountMovement(customerId, movementId),
    onSuccess: (_result, { customerId }) => invalidateAccountQueries(queryClient, customerId),
  });
  return {
    deleteMovement: mutation.mutate,
    deleteMovementAsync: mutation.mutateAsync,
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

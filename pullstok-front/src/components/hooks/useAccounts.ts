import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  seedDefaultAccounts,
  type Account,
  type AccountInput,
} from "../../services/accounts";

export const useAccounts = () => {
  const { data, error, isLoading, isError } = useQuery<Account[], Error>({
    queryKey: ["accounts"],
    queryFn: getAccounts,
  });

  return {
    accounts: data,
    loadingAccounts: isLoading,
    errorAccounts: isError ? error : null,
  };
};

export const useCreateAccount = () => {
  const queryClient = useQueryClient();
  const mutation = useMutation<Account, Error, AccountInput>({
    mutationFn: createAccount,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["accounts"] }),
  });
  return { submitAccount: mutation.mutate, loadingCreate: mutation.isPending };
};

export const useUpdateAccount = () => {
  const queryClient = useQueryClient();
  const mutation = useMutation<Account, Error, AccountInput & { id: string }>({
    mutationFn: updateAccount,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["accounts"] }),
  });
  return { updateAccount: mutation.mutate, loadingUpdate: mutation.isPending };
};

export const useDeleteAccount = () => {
  const queryClient = useQueryClient();
  const mutation = useMutation<void, Error, string>({
    mutationFn: deleteAccount,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["accounts"] }),
  });
  return { deleteAccount: mutation.mutate, loadingDelete: mutation.isPending };
};

export const useSeedDefaultAccounts = () => {
  const queryClient = useQueryClient();
  const mutation = useMutation<{ count: number }, Error, void>({
    mutationFn: seedDefaultAccounts,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["accounts"] }),
  });
  return { seedAccounts: mutation.mutate, loadingSeed: mutation.isPending };
};

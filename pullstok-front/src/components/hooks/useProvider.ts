import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getProviders,
  createProvider,
  updateProvider,
  deleteProvider,
  type Provider,
  type ProviderInput,
} from "../../services/providers";

export const useProviders = () => {
  const { data, error, isLoading, isError } = useQuery<Provider[], Error>({
    queryKey: ["providers"],
    queryFn: getProviders,
  });

  return {
    providers: data,
    loadingProvider: isLoading,
    errorProvider: isError ? error : null,
  };
};

export const useCreateProvider = () => {
  const queryClient = useQueryClient();
  const mutation = useMutation<Provider, Error, ProviderInput>({
    mutationFn: createProvider,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["providers"] });
    },
  });

  return {
    submitProvider: mutation.mutate,
    loadingProvider: mutation.isPending,
    errorProvider: mutation.isError ? mutation.error : null,
  };
};

export const useUpdateProvider = () => {
  const queryClient = useQueryClient();
  const mutation = useMutation<Provider, Error, ProviderInput & { id: string }>({
    mutationFn: updateProvider,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["providers"] });
    },
  });

  return {
    updateProvider: mutation.mutate,
    loadingUpdate: mutation.isPending,
    error: mutation.isError ? mutation.error : null,
  };
};

export const useDeleteProvider = () => {
  const queryClient = useQueryClient();
  const mutation = useMutation<void, Error, string>({
    mutationFn: deleteProvider,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["providers"] });
    },
  });

  return {
    deleteProvider: mutation.mutate,
    loading: mutation.isPending,
  };
};

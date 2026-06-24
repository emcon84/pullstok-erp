import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import {
  getStoreSettings,
  updateStoreSettings,
  publishProduct,
  StoreSettings,
} from "../../services/storeSettingsService";

export const useStoreSettings = () => {
  const { data, isLoading, error } = useQuery<StoreSettings, Error>({
    queryKey: ["store-settings"],
    queryFn: getStoreSettings,
  });

  return { settings: data, loading: isLoading, error };
};

export const useUpdateStoreSettings = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation<StoreSettings, Error, Partial<StoreSettings>>({
    mutationFn: updateStoreSettings,
    onSuccess: () => {
      toast.success("Configuración de la tienda guardada");
      queryClient.invalidateQueries({ queryKey: ["store-settings"] });
    },
    onError: (error) => {
      toast.error(error.message || "Error al guardar la configuración");
    },
  });

  return {
    updateSettings: mutation.mutate,
    loading: mutation.isPending,
    error: mutation.isError ? mutation.error : null,
    success: mutation.isSuccess,
  };
};

export const usePublishProduct = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation<
    void,
    Error,
    { productId: string; publishedToStore: boolean }
  >({
    mutationFn: ({ productId, publishedToStore }) =>
      publishProduct(productId, publishedToStore),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (error) => {
      toast.error(error.message || "Error al publicar el producto");
    },
  });

  return {
    setPublished: mutation.mutate,
    loading: mutation.isPending,
  };
};

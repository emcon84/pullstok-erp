import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import {
  getStoreSettings,
  updateStoreSettings,
  publishProduct,
  StoreSettings,
} from "../../services/storeSettingsService";
import {
  bulkPublishProducts,
  StoreBrands,
  listStoreBrands,
} from "../../services/productService";
import { DataItem } from "../../types";

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
  const PRODUCTS_KEY = ["products"];

  const mutation = useMutation<
    void,
    Error,
    { productId: string; publishedToStore: boolean },
    { previous?: DataItem[] }
  >({
    mutationFn: ({ productId, publishedToStore }) =>
      publishProduct(productId, publishedToStore),
    // Optimista: el switch cambia al instante — actualiza el cache compartido
    // de ["products"] ANTES del PATCH y lo revierte si el servidor falla.
    onMutate: async ({ productId, publishedToStore }) => {
      await queryClient.cancelQueries({ queryKey: PRODUCTS_KEY });
      const previous = queryClient.getQueryData<DataItem[]>(PRODUCTS_KEY);
      if (Array.isArray(previous)) {
        queryClient.setQueryData<DataItem[]>(PRODUCTS_KEY, (old) =>
          Array.isArray(old)
            ? old.map((p) =>
                (p._id ?? p.id) === productId ? { ...p, publishedToStore } : p,
              )
            : old,
        );
      }
      return { previous };
    },
    onError: (error, _variables, context) => {
      // Revierte el cache (vuelve al estado previo al click) + toast.
      queryClient.setQueryData(PRODUCTS_KEY, context?.previous);
      toast.error(error.message || "Error al publicar el producto");
    },
    onSettled: () => {
      // Refetch silencioso en background: el switch no "vuelve atrás" nunca.
      queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY });
    },
  });

  return {
    setPublished: mutation.mutate,
    loading: mutation.isPending,
  };
};

/** Marca/desmarca en tienda TODOS los productos de una marca (variante "Marca"). */
export const useBulkPublish = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation<
    { count: number },
    Error,
    { brandValues: string[]; publishedToStore: boolean }
  >({
    mutationFn: ({ brandValues, publishedToStore }) =>
      bulkPublishProducts(brandValues, publishedToStore),
    onSuccess: ({ count }) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success(`${count} producto(s) actualizado(s) en la tienda`);
    },
    onError: (error) => {
      toast.error(error.message || "Error en la publicación masiva");
    },
  });

  return {
    bulkPublish: mutation.mutate,
    loading: mutation.isPending,
  };
};

/** Marcas disponibles para el selector del bulk-publish (GET /products/brands). */
export const useStoreBrands = () => {
  const { data, isLoading } = useQuery<StoreBrands, Error>({
    queryKey: ["store-brands"],
    queryFn: listStoreBrands,
  });

  return {
    brands: data?.brands ?? [],
    loading: isLoading,
  };
};

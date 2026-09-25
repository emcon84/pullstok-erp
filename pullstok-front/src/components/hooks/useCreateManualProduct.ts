import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createManualProduct as createManualProductApi,
  type ManualProductPayload,
} from "@/services/productService";
import type { DataItem } from "@/types";

/**
 * Crea un producto manual (POST /products/manual). Al éxito refresca la lista
 * ["products"] para que el producto también aparezca al buscarlo después. El
 * manejo de errores (toast) lo hace el llamador: `createManualProduct` rechaza
 * con el message del backend.
 */
export const useCreateManualProduct = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation<DataItem, Error, ManualProductPayload>({
    mutationFn: (payload) => createManualProductApi(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });

  return {
    createManualProduct: mutation.mutateAsync,
    creating: mutation.isPending,
  };
};

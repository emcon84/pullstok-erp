import { useMutation, useQueryClient } from "@tanstack/react-query";
import { promoteManualProduct, type ManualProduct } from "@/services/productService";

export interface PromoteManualProductInput {
  id: string;
  categoryId: string;
}

/**
 * "Agregar al sistema" (POST /products/:id/promote). Al éxito refresca la lista
 * de manuales y ["products"] (el producto ya es real y cambió de categoría). El
 * toast de error lo hace el llamador: `promote` rechaza con el message del server.
 */
export const usePromoteManualProduct = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation<ManualProduct, Error, PromoteManualProductInput>({
    mutationFn: ({ id, categoryId }) => promoteManualProduct(id, categoryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["manual-products"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });

  return {
    promote: mutation.mutateAsync,
    promoting: mutation.isPending,
  };
};

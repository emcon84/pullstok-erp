import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteManualProduct, type ApiError } from "@/services/productService";

/**
 * Eliminar un producto manual (DELETE /products/manual/:id). Al éxito refresca la
 * lista de manuales y ["products"]. El toast de error lo hace el llamador:
 * `deleteProduct` rechaza con el message del server (y `status`, ej. 409/404).
 */
export const useDeleteManualProduct = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation<{ message: string }, ApiError, string>({
    mutationFn: (id) => deleteManualProduct(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["manual-products"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });

  return {
    deleteProduct: mutation.mutateAsync,
    deleting: mutation.isPending,
  };
};

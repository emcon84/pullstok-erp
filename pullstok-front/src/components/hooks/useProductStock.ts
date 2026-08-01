import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getProductStock,
  updateBranchStock as updateBranchStockApi,
  type ProductStockResponse,
} from "@/services/productService";

export interface BranchStockUpdate {
  branchId: string;
  quantity: number;
}

/**
 * Reads the self-contained per-branch stock of a product (spec A1) and
 * updates a single branch via PUT (spec A2). The update invalidates both the
 * products list and this branch-stock query so every view reflects the new
 * quantity. The legacy Product.quantity only changes for the HQ branch,
 * server-side (spec D4).
 */
export const useProductStock = (productId?: string | null) => {
  const queryClient = useQueryClient();

  const { data, error, isLoading } = useQuery<ProductStockResponse, Error>({
    queryKey: ["product-stock", productId],
    queryFn: () => getProductStock(productId as string),
    enabled: !!productId,
  });

  const mutation = useMutation<
    { branchId: string; quantity: number },
    Error,
    BranchStockUpdate
  >({
    mutationFn: ({ branchId, quantity }) =>
      updateBranchStockApi(productId as string, branchId, quantity),
    onError: (mutationError) => {
      console.error("Error updating branch stock:", mutationError.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product-stock", productId] });
    },
  });

  return {
    stock: data,
    loading: isLoading,
    error,
    updateBranchStock: mutation.mutateAsync,
    updating: mutation.isPending,
  };
};

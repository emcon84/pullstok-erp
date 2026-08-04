import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createSale, deleteSale, getSales } from "../../services/saleServices";
import { CartItem, Sale } from "../../models/salesModel";

export const useCreateSale = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation<
    void,
    Error,
    { cart: CartItem[]; orderId?: string }
  >({
    mutationFn: async ({ cart, orderId }) => {
      const saleRequest = {
        products: cart.map((item) => ({
          productId: item.product._id || item.product.id || "",
          quantity: item.quantity.toString(),
          name: item.product.name,
          price: item.product.price.toString(),
          description: item.product.description || "",
          category: item.product.category || "",
        })),
      };
      await createSale(saleRequest, orderId);
    },
    onError: (error) => {
      console.error("Error creating sale:", error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] }); // Invalidar específicamente la query de sales
      queryClient.invalidateQueries({ queryKey: ["orders"] }); // Invalidar orders: si la venta viene de un pedido, el backend lo marca COMPLETED y la pill debe refrescarse
    },
  });

  return {
    createSale: mutation.mutate,
    loading: mutation.isPending,
    error: mutation.error,
    success: mutation.isSuccess,
  };
};

export const useDeleteSale = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation<void, Error, string>({
    mutationFn: deleteSale,
    onError: (error) => {
      console.error("Error deleting sale:", error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] }); // La lista de ventas cambió
      queryClient.invalidateQueries({ queryKey: ["orders"] }); // Si la venta venía de un pedido, el backend lo revierte a PENDING
    },
  });

  return {
    deleteSale: mutation.mutate,
    loading: mutation.isPending,
    error: mutation.error,
    success: mutation.isSuccess,
  };
};

export const useGetSales = (branchId?: string) => {
  const {
    data: sales,
    error,
    isLoading,
  } = useQuery<Sale[], Error>({
    queryKey: ["sales", branchId].filter(Boolean),
    queryFn: () => getSales(branchId),
  });

  return {
    sales: sales || [], // Asegura que sales siempre sea un array
    loading: isLoading,
    error,
  };
};

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createSale, getSales } from "../../services/saleServices";
import { CartItem, Sale } from "../../models/salesModel";

export const useCreateSale = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation<void, Error, CartItem[]>({
    mutationFn: async (cart: CartItem[]) => {
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
      await createSale(saleRequest);
    },
    onError: (error) => {
      console.error("Error creating sale:", error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] }); // Invalidar específicamente la query de sales
    },
  });

  return {
    createSale: mutation.mutate,
    loading: mutation.isPending,
    error: mutation.error,
    success: mutation.isSuccess,
  };
};

export const useGetSales = () => {
  const {
    data: sales,
    error,
    isLoading,
  } = useQuery<Sale[], Error>({
    queryKey: ["sales"],
    queryFn: getSales,
  });

  return {
    sales: sales || [], // Asegura que sales siempre sea un array
    loading: isLoading,
    error,
  };
};

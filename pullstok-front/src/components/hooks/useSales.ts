import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createSale, deleteSale, getSales } from "../../services/saleServices";
import { CartItem, Sale, SaleMode } from "../../models/salesModel";
import { PaymentInput } from "../../models/cashSessionModel";

export const useCreateSale = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation<
    void,
    Error,
    { cart: CartItem[]; orderId?: string; payments?: PaymentInput[]; cashSessionId?: string; discountPct?: number; surchargePct?: number }
  >({
    mutationFn: async ({ cart, orderId, payments, cashSessionId, discountPct, surchargePct }) => {
      const saleRequest = {
        products: cart.map((item) => {
          const saleMode: SaleMode = item.saleMode ?? "BOLSA_CERRADA";
          if (item.loosePriceId) {
            // Venta suelta desde la planilla: la línea se identifica por
            // loosePriceId (SR único en el backend, saleProductSchema). NO se
            // manda productId: el item suelto no consume stock físico.
            return {
              loosePriceId: item.loosePriceId,
              looseName: item.looseName ?? item.product.name,
              quantity: item.quantity.toString(),
              name: item.product.name,
              price: item.product.price.toString(),
              category: item.product.category ?? "",
              saleMode,
              // sdd/venta-pastillas-sueltas-blister: no aplica a líneas
              // sueltas por celda, pero se reenvía igual por si el caller
              // arma una línea mixta (harmless: undefined se descarta al
              // serializar).
              piecesPerBlister: item.piecesPerBlister ?? undefined,
            };
          }
          return {
            productId: item.product._id || item.product.id || "",
            quantity: item.quantity.toString(),
            name: item.product.name,
            price: item.product.price.toString(),
            description: item.product.description || "",
            category: item.product.category || "",
            saleMode,
            // sdd/venta-pastillas-sueltas-blister: conteo ad-hoc de la línea
            // POR_UNIDAD_BLISTER; el server lo exige (saleProductSchema, T1).
            piecesPerBlister: item.piecesPerBlister ?? undefined,
          };
        }),
        payments,
        cashSessionId,
        discountPct,
        // Solo viaja cuando hay recargo: el payload de las demás ventas no cambia.
        ...(surchargePct && surchargePct > 0 ? { surchargePct } : {}),
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

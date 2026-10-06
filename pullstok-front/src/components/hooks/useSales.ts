import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createSale, deleteSale, getSales } from "../../services/saleServices";
import { CartItem, Sale, SaleMode } from "../../models/salesModel";
import { PaymentInput } from "../../models/cashSessionModel";

/** El server exige `category` como string. Un producto que viene de un pedido
 *  trae la categoría populada ({ id, name }): se manda su nombre. */
const categoryName = (category: unknown): string => {
  if (typeof category === "string") return category;
  const name = (category as { name?: unknown } | null | undefined)?.name;
  return typeof name === "string" ? name : "";
};

export const useCreateSale = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation<
    void,
    Error,
    { cart: CartItem[]; orderId?: string; payments?: PaymentInput[]; cashSessionId?: string; discountPct?: number; surchargePct?: number; customerId?: string }
  >({
    mutationFn: async ({ cart, orderId, payments, cashSessionId, discountPct, surchargePct, customerId }) => {
      const saleRequest = {
        products: cart.map((item) => {
          const saleMode: SaleMode = item.saleMode ?? "BOLSA_CERRADA";
          if (item.freeLine) {
            // Venta libre: sin productId ni loosePriceId. `quantity` va en kg y
            // `lineTotal` es el monto autoritativo de la línea (el server ignora price).
            return {
              freeLine: true as const,
              name: item.product.name,
              quantity: item.quantity.toString(),
              lineTotal: item.lineTotal ?? item.totalPrice,
              price: item.product.price.toString(),
              category: "",
              saleMode: "POR_PESO" as SaleMode,
            };
          }
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
              category: categoryName(item.product.category),
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
            category: categoryName(item.product.category),
            saleMode,
            // sdd/venta-pastillas-sueltas-blister: conteo ad-hoc de la línea
            // POR_UNIDAD_BLISTER; el server lo exige (saleProductSchema, T1).
            piecesPerBlister: item.piecesPerBlister ?? undefined,
            // sdd/product-presentations: el server resuelve precio y factor por id.
            ...(item.presentationId ? { presentationId: item.presentationId } : {}),
          };
        }),
        payments,
        cashSessionId,
        discountPct,
        // Solo viaja cuando hay recargo: el payload de las demás ventas no cambia.
        ...(surchargePct && surchargePct > 0 ? { surchargePct } : {}),
        // Solo viaja en ventas a cuenta corriente (cliente al que va la deuda).
        ...(customerId ? { customerId } : {}),
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
    /** Variante que espera el resultado y RECHAZA con el error del servidor
     *  ({ error, message }): el checkout la usa para no vaciar el carrito ni
     *  dar por vendida una venta que el servidor rechazó. */
    createSaleAsync: mutation.mutateAsync,
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

import { useQuery } from "@tanstack/react-query";
import { getManualProducts, type ManualProduct } from "@/services/productService";

const EMPTY: ManualProduct[] = [];

/**
 * Lista de productos manuales pendientes (GET /products/manual). Sin refetch al
 * volver a la ventana: la lista solo cambia por acciones del propio admin (la
 * mutation de promover la invalida) o por el botón "Reintentar".
 */
export const useManualProducts = () => {
  const { data, error, isLoading, refetch } = useQuery<ManualProduct[], Error>({
    queryKey: ["manual-products"],
    queryFn: getManualProducts,
    refetchOnWindowFocus: false,
  });

  return {
    products: data ?? EMPTY,
    loading: isLoading,
    error: error ?? null,
    refetch,
  };
};

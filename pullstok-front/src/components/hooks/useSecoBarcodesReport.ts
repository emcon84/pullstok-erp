import { useQuery } from "@tanstack/react-query";
import {
  getSecoBarcodesReport,
  type SecoBarcodesReport,
} from "@/services/productService";

/**
 * Reporte de productos de "Alimento Seco" con/sin código de barras (admin).
 * Se dispara solo cuando el panel está abierto: `enabled` gatea la query desde
 * el componente de diálogo (no se fetchea en el mount de un listado).
 */
export const useSecoBarcodesReport = (enabled: boolean) => {
  const { data, error, isLoading, refetch } = useQuery<SecoBarcodesReport, Error>({
    queryKey: ["seco-barcodes-report"],
    queryFn: () => getSecoBarcodesReport(),
    enabled,
    staleTime: 0,
  });
  return { report: data, loading: isLoading, error, refetch };
};

import { useQuery } from "@tanstack/react-query";
import {
  getStockSummary,
  type StockSummary,
} from "@/services/productService";

/**
 * Reads the org-wide stock summary (dashboard "Productos" card + per-branch
 * cards). Always enabled: there is no argument to gate on, every
 * authenticated dashboard session needs it.
 */
export const useStockSummary = () => {
  const { data, error, isLoading } = useQuery<StockSummary, Error>({
    queryKey: ["stock-summary"],
    queryFn: () => getStockSummary(),
  });

  return {
    summary: data,
    loading: isLoading,
    error,
  };
};

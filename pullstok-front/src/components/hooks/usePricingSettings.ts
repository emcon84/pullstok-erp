import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import {
  getPricingSetting,
  updatePricingSetting,
  PricingSetting,
  UpdatePricingSettingResult,
  PricingDryRunResult,
} from "../../services/pricingService";

export const usePricingSettings = () => {
  const { data, isLoading, error } = useQuery<PricingSetting, Error>({
    queryKey: ["pricing-settings"],
    queryFn: getPricingSetting,
    staleTime: Infinity,
  });

  return { pricing: data ?? null, loading: isLoading, error };
};

export const useUpdatePricingSettings = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation<
    UpdatePricingSettingResult | PricingDryRunResult,
    Error,
    { bulkFactor: number; dryRun?: boolean }
  >({
    mutationFn: ({ bulkFactor, dryRun }) =>
      updatePricingSetting({ bulkFactor }, dryRun),
    onSuccess: (data, variables) => {
      if (!variables.dryRun && "recomputed" in data) {
        toast.success(
          `Factor guardado. ${data.recomputed} productos recalculados.`,
        );
        queryClient.invalidateQueries({ queryKey: ["pricing-settings"] });
      }
    },
    onError: (error) => {
      toast.error(error.message || "Error al guardar");
    },
  });

  return {
    updatePricing: mutation.mutate,
    result: mutation.data ?? null,
    loading: mutation.isPending,
    error: mutation.isError ? mutation.error : null,
  };
};

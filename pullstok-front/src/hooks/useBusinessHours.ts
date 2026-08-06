import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import {
  getBusinessHours,
  updateBusinessHours,
  BusinessHoursSettings,
} from "../services/businessHoursService";

export const useBusinessHours = () => {
  const { data, isLoading, error } = useQuery<BusinessHoursSettings, Error>({
    queryKey: ["business-hours"],
    queryFn: getBusinessHours,
  });

  return { settings: data ?? null, loading: isLoading, error };
};

export const useUpdateBusinessHours = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation<
    BusinessHoursSettings,
    Error,
    BusinessHoursSettings
  >({
    mutationFn: updateBusinessHours,
    onSuccess: () => {
      toast.success("Horario comercial guardado");
      queryClient.invalidateQueries({ queryKey: ["business-hours"] });
    },
    onError: (error) => {
      toast.error(error.message || "Error al guardar el horario comercial");
    },
  });

  return {
    updateSettings: mutation.mutate,
    loading: mutation.isPending,
    error: mutation.isError ? mutation.error : null,
    success: mutation.isSuccess,
  };
};
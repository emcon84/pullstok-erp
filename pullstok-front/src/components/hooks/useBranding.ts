import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import {
  getAppBranding,
  updateAppBranding,
  AppBranding,
  UpdateAppBrandingInput,
} from "../../services/brandingService";

export const useBranding = () => {
  const { data, isLoading, error } = useQuery<AppBranding, Error>({
    queryKey: ["app-branding"],
    queryFn: getAppBranding,
    staleTime: Infinity,
  });

  return { branding: data ?? null, loading: isLoading, error };
};

export const useUpdateBranding = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation<AppBranding, Error, UpdateAppBrandingInput>({
    mutationFn: updateAppBranding,
    onSuccess: () => {
      toast.success("Ajustes de marca guardados");
      queryClient.invalidateQueries({ queryKey: ["app-branding"] });
    },
    onError: (error) => {
      toast.error(error.message || "Error al guardar los ajustes");
    },
  });

  return {
    updateBranding: mutation.mutate,
    loading: mutation.isPending,
    error: mutation.isError ? mutation.error : null,
    success: mutation.isSuccess,
  };
};

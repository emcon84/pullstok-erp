import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import {
  getBotConfig,
  updateBotConfig,
  BotConfig,
  UpdateBotConfigInput,
} from "../../services/botConfigService";

export const useBotConfig = () => {
  const { data, isLoading, error } = useQuery<BotConfig, Error>({
    queryKey: ["bot", "config"],
    queryFn: getBotConfig,
  });

  return { config: data, loading: isLoading, error };
};

export const useUpdateBotConfig = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation<BotConfig, Error, UpdateBotConfigInput>({
    mutationFn: updateBotConfig,
    onSuccess: () => {
      toast.success("Configuración del asistente guardada");
      queryClient.invalidateQueries({ queryKey: ["bot", "config"] });
    },
    onError: (error) => {
      toast.error(error.message || "Error al guardar la configuración");
    },
  });

  return {
    updateConfig: mutation.mutate,
    loading: mutation.isPending,
    error: mutation.isError ? mutation.error : null,
    success: mutation.isSuccess,
  };
};

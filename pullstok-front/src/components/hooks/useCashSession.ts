import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  openCashSession as openCashSessionApi,
  closeCashSession as closeCashSessionApi,
  getCurrentCashSession as getCurrentCashSessionApi,
  getCashSession as getCashSessionApi,
  getCashSessions as getCashSessionsApi,
} from "../../services/cashSessionServices";
import {
  CashSession,
  CashCloseResult,
  OpenCashPayload,
  CloseCashPayload,
} from "../../models/cashSessionModel";

/**
 * Caja (sdd/caja-apertura-cierre) — hooks react-query (patrón useSales.ts).
 */

export const useOpenCashSession = () => {
  const queryClient = useQueryClient();
  const mutation = useMutation<CashSession, Error, OpenCashPayload>({
    mutationFn: (payload) => openCashSessionApi(payload),
    onSuccess: () => {
      // Tras abrir, la sesión actual (GET /current) cambia.
      queryClient.invalidateQueries({ queryKey: ["cash-sessions"] });
    },
  });
  return {
    openCashSession: mutation.mutate,
    loading: mutation.isPending,
    error: mutation.isError ? mutation.error : null,
    success: mutation.isSuccess,
  };
};

export const useCloseCashSession = () => {
  const queryClient = useQueryClient();
  const mutation = useMutation<
    CashCloseResult,
    Error,
    { id: string; payload: CloseCashPayload }
  >({
    mutationFn: ({ id, payload }) => closeCashSessionApi(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cash-sessions"] });
    },
  });
  return {
    closeCashSession: mutation.mutate,
    loading: mutation.isPending,
    error: mutation.isError ? mutation.error : null,
    success: mutation.isSuccess,
    result: mutation.data,
  };
};

export const useGetCurrentCashSession = (branchId?: string) => {
  const {
    data,
    error,
    isLoading,
    refetch,
  } = useQuery<CashSession | null, Error>({
    queryKey: ["cash-sessions", "current", branchId].filter(Boolean),
    queryFn: () => getCurrentCashSessionApi(branchId),
  });
  return {
    session: data ?? null,
    loading: isLoading,
    error,
    refetch,
  };
};

export const useGetCashSession = (id: string) => {
  const { data, error, isLoading } = useQuery<CashSession, Error>({
    queryKey: ["cash-sessions", id],
    queryFn: () => getCashSessionApi(id),
    enabled: !!id,
  });
  return {
    session: data ?? null,
    loading: isLoading,
    error,
  };
};

export const useGetCashSessions = (params?: {
  status?: string;
  branchId?: string;
}) => {
  const {
    data,
    error,
    isLoading,
    refetch,
  } = useQuery<CashSession[], Error>({
    queryKey: ["cash-sessions", "list", params?.status, params?.branchId].filter(Boolean),
    queryFn: () => getCashSessionsApi(params),
  });
  return {
    sessions: data || [],
    loading: isLoading,
    error,
    refetch,
  };
};

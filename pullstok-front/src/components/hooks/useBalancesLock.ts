import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getBalancesSummary, unlockBalancesView } from "../../services/customerAccountService";
import type { BalancesSummary, BalancesUnlockResult } from "../../models/customerAccountModel";

const SUMMARY_KEY = ["balances-summary"];

/**
 * Password-locked balances summary. The unlock token lives ONLY in this hook's
 * memory state (never web storage); it is discarded on hide, on expiry, or when
 * the server answers BALANCES_LOCKED.
 */
export const useBalancesLock = () => {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<BalancesUnlockResult | null>(null);

  const lock = useCallback(() => {
    setSession(null);
    queryClient.removeQueries({ queryKey: SUMMARY_KEY });
  }, [queryClient]);

  const unlockMutation = useMutation<BalancesUnlockResult, Error, string>({
    mutationFn: (password) => unlockBalancesView(password),
    onSuccess: setSession,
  });

  // Re-lock when the token expires.
  useEffect(() => {
    if (!session) return;
    const id = setTimeout(lock, session.expiresInSec * 1000);
    return () => clearTimeout(id);
  }, [session, lock]);

  const summaryQuery = useQuery<BalancesSummary, Error & { code?: string }>({
    queryKey: [...SUMMARY_KEY, session?.token],
    queryFn: () => getBalancesSummary(session!.token),
    enabled: !!session,
    retry: false,
  });

  const summaryError = summaryQuery.error;
  useEffect(() => {
    if (summaryError?.code === "BALANCES_LOCKED") lock();
  }, [summaryError, lock]);

  return {
    unlocked: !!session,
    summary: session ? (summaryQuery.data ?? null) : null,
    loadingSummary: !!session && summaryQuery.isLoading,
    summaryError: session ? summaryError : null,
    unlock: unlockMutation.mutateAsync,
    unlocking: unlockMutation.isPending,
    unlockError: unlockMutation.error,
    resetUnlockError: unlockMutation.reset,
    lock,
  };
};

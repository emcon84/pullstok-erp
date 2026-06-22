import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createReceipt, getReceipts } from "../../services/receiptService";
import { Receipt } from "../../models/receiptModel";

export const useCreateReceipt = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation<Receipt, Error, { relatedDocument: string }>({
    mutationFn: createReceipt,
    onError: (error) => {
      console.error("Error creating receipt:", error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["receipts"] });
    },
  });

  return {
    createReceipt: mutation.mutate,
    loading: mutation.isPending,
    error: mutation.error,
    success: mutation.isSuccess,
  };
};

export const useGetReceipts = () => {
  const {
    data: receipts,
    error,
    isLoading,
  } = useQuery<Receipt[], Error>({
    queryKey: ["receipts"],
    queryFn: getReceipts,
  });

  return {
    receipts: receipts || [],
    loading: isLoading,
    error,
  };
};

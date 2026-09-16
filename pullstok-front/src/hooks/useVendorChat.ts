import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  vendorChatApiClient,
  type VendorChat,
  type VendorChatMessage,
} from "@/services/vendorChatService";

export const vendorChatKeys = {
  conversations: ["vendorChat", "conversations"] as const,
  conversation: (id: string) => ["vendorChat", "conversation", id] as const,
  messages: (convId: string) => ["vendorChat", "messages", convId] as const,
};

export const useCreateVendorChat = () => {
  const queryClient = useQueryClient();

  return useMutation<VendorChat, Error, { sellerId: string }>({
    mutationFn: (data) => vendorChatApiClient.createConversation(data),
    onSuccess: (_data) => {
      queryClient.invalidateQueries({
        queryKey: vendorChatKeys.conversations,
      });
    },
  });
};

export const useListVendorChats = () => {
  return useQuery<VendorChat[], Error>({
    queryKey: vendorChatKeys.conversations,
    queryFn: () => vendorChatApiClient.listConversations(),
  });
};

export const useGetVendorChat = (id: string | null) => {
  return useQuery<VendorChat, Error>({
    queryKey: vendorChatKeys.conversation(id ?? ""),
    queryFn: () => vendorChatApiClient.getConversation(id as string),
    enabled: !!id,
  });
};

export const useGetMessages = (conversationId: string | null) => {
  return useQuery<VendorChatMessage[], Error>({
    queryKey: vendorChatKeys.messages(conversationId ?? ""),
    queryFn: () =>
      vendorChatApiClient.getConversation(conversationId as string).then(
        (chat) => chat.messages,
      ),
    enabled: !!conversationId,
    // La respuesta del bot llega en background (fire-and-forget en el
    // backend), sin socket que avise al cliente: sin este polling, el
    // mensaje del asistente queda en la base sin mostrarse hasta reabrir.
    refetchInterval: 3000,
  });
};

export const useSendVendorMessage = () => {
  const queryClient = useQueryClient();

  return useMutation<VendorChatMessage, Error, { conversationId: string; sender: "SELLER" | "ASSISTANT"; body: string }>({
    mutationFn: ({ conversationId, sender, body }) =>
      vendorChatApiClient.sendMessage(conversationId, sender, body),
    onSuccess: (_data, { conversationId }) => {
      queryClient.invalidateQueries({
        queryKey: vendorChatKeys.messages(conversationId),
      });
      queryClient.invalidateQueries({
        queryKey: vendorChatKeys.conversation(conversationId),
      });
    },
  });
};

export const useCloseVendorChat = () => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) => vendorChatApiClient.closeConversation(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({
        queryKey: vendorChatKeys.conversations,
      });
      queryClient.invalidateQueries({
        queryKey: vendorChatKeys.conversation(id),
      });
    },
  });
};

export const useDeleteVendorChat = () => {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) => vendorChatApiClient.deleteConversation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: vendorChatKeys.conversations,
      });
    },
  });
};

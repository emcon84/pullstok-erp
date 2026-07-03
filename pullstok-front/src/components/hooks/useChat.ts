import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  getConversations,
  getMessages,
  sendMessage,
  type ConversationDTO,
  type MessageDTO,
} from "../../services/chatService";

/**
 * Query keys del chat (centralizadas para no tipear strings sueltos):
 * - ['chat','conversations']       -> lista de la bandeja + badge no-leídos
 * - ['chat','messages', convId]    -> hilo de una conversación
 */
export const chatKeys = {
  conversations: ["chat", "conversations"] as const,
  messages: (convId: string) => ["chat", "messages", convId] as const,
};

// Lista de conversaciones de la bandeja.
export const useConversations = () => {
  return useQuery<ConversationDTO[], Error>({
    queryKey: chatKeys.conversations,
    queryFn: getConversations,
  });
};

// Total de mensajes no leídos (suma de unreadCount) para el badge de la
// sidebar. Deriva de la MISMA query de conversaciones — sin request extra.
export const useUnreadMessagesCount = () => {
  const { data } = useConversations();
  const count = (data ?? []).reduce((acc, c) => acc + (c.unreadCount ?? 0), 0);
  return { count };
};

// Hilo de mensajes de una conversación. `enabled` para no disparar sin id.
export const useMessages = (conversationId: string | null) => {
  return useQuery<MessageDTO[], Error>({
    queryKey: chatKeys.messages(conversationId ?? ""),
    queryFn: () => getMessages(conversationId as string),
    enabled: !!conversationId,
  });
};

// El operador envía una respuesta. Al terminar invalida el hilo y la lista
// (para actualizar preview/orden). El socket también empujará el mensaje, pero
// invalidar garantiza consistencia inmediata para quien lo mandó.
export const useSendMessage = () => {
  const queryClient = useQueryClient();

  const mutation = useMutation<
    MessageDTO,
    Error,
    { conversationId: string; body: string }
  >({
    mutationFn: ({ conversationId, body }) => sendMessage(conversationId, body),
    onSuccess: (_data, { conversationId }) => {
      queryClient.invalidateQueries({
        queryKey: chatKeys.messages(conversationId),
      });
      queryClient.invalidateQueries({ queryKey: chatKeys.conversations });
    },
  });

  return {
    sendMessage: mutation.mutate,
    sendMessageAsync: mutation.mutateAsync,
    loading: mutation.isPending,
    error: mutation.isError ? mutation.error : null,
  };
};

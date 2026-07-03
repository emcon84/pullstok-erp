import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSocket } from "../../lib/socket";
import { chatKeys } from "./useChat";
import type { MessageDTO } from "../../services/chatService";

/**
 * Tiempo real del chat sobre el socket COMPARTIDO (`lib/socket.ts`), el mismo
 * que usan los pedidos. Dos alcances distintos:
 *
 * 1. `useChatConversationsRealtime` — GLOBAL. Se monta una vez en el árbol
 *    autenticado (ProtectedLayout). El operador ya está en su room `org:<id>`
 *    al conectar, así que recibe `chat:conversation-updated` para CUALQUIER
 *    conversación de la org. Ante el evento invalida la lista -> refresca la
 *    bandeja y el badge de no-leídos de la sidebar, incluso si no estás en la
 *    vista de Mensajes.
 *
 * 2. `useChatThreadRealtime(convId)` — POR CONVERSACIÓN ABIERTA. Emite
 *    `chat:join`/`chat:leave` para entrar/salir del room `conv:<id>` y escucha
 *    `chat:message` (payload MessageDTO). Al llegar un mensaje de esa
 *    conversación lo appendea al hilo cacheado e invalida la lista para
 *    reordenar/preview.
 */

export const useChatConversationsRealtime = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const socket = getSocket(token);

    const handleConversationUpdated = () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.conversations });
    };

    socket.on("chat:conversation-updated", handleConversationUpdated);

    return () => {
      socket.off("chat:conversation-updated", handleConversationUpdated);
    };
  }, [queryClient]);
};

export const useChatThreadRealtime = (conversationId: string | null) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!conversationId) return;
    const token = localStorage.getItem("token");
    if (!token) return;

    const socket = getSocket(token);

    // Entramos al room de la conversación para recibir sus chat:message.
    const join = () => socket.emit("chat:join", { conversationId });
    join();
    // Si el socket se reconecta, re-emitimos el join (el server pierde el room).
    socket.on("connect", join);

    const handleMessage = (msg: MessageDTO) => {
      if (msg.conversationId !== conversationId) return;

      // Appendear al hilo cacheado evitando duplicados (el que envía el
      // operador ya lo mete por invalidación; el socket puede repetirlo).
      queryClient.setQueryData<MessageDTO[]>(
        chatKeys.messages(conversationId),
        (prev) => {
          if (!prev) return prev;
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        },
      );

      // Reordenar bandeja + preview + badge.
      queryClient.invalidateQueries({ queryKey: chatKeys.conversations });
    };

    socket.on("chat:message", handleMessage);

    return () => {
      socket.emit("chat:leave", { conversationId });
      socket.off("chat:message", handleMessage);
      socket.off("connect", join);
    };
  }, [conversationId, queryClient]);
};

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSocket } from "../../lib/socket";
import { chatKeys } from "./useChat";
import type { ChatSender, MessageDTO } from "../../services/chatService";

/** Payloads de los eventos PRO (Fase D) que recibe el operador. */
interface TypingEvent {
  conversationId: string;
  from: ChatSender;
  isTyping: boolean;
}
interface PresenceEvent {
  conversationId: string;
  party: ChatSender;
  online: boolean;
}
interface ReadEvent {
  conversationId: string;
  reader: ChatSender;
  readAt: string;
}

/**
 * Estado + emisores que devuelve `useChatThreadRealtime` para pintar los
 * indicadores PRO (Fase D) en el hilo abierto:
 * - `guestTyping`  -> el cliente está escribiendo AHORA.
 * - `guestOnline`  -> presencia del cliente en el header.
 * - `notifyTyping` -> llamar en cada tecla del operador (throttlea el emit).
 * - `stopTyping`   -> llamar al enviar (corta el "escribiendo…" al instante).
 */
export interface ChatThreadRealtime {
  guestTyping: boolean;
  guestOnline: boolean;
  notifyTyping: () => void;
  stopTyping: () => void;
}

// Tras 2s sin teclear cortamos el "escribiendo…" propio.
const TYPING_STOP_MS = 2000;
// Red de seguridad: si no llega refresh, ocultamos el "escribiendo…" del guest.
const TYPING_SAFETY_MS = 4000;

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

export const useChatThreadRealtime = (
  conversationId: string | null,
): ChatThreadRealtime => {
  const queryClient = useQueryClient();
  const [guestTyping, setGuestTyping] = useState(false);
  const [guestOnline, setGuestOnline] = useState(false);

  // Refs para el throttle del "escribiendo…" propio y la red de seguridad del
  // ajeno. Viven en refs para no re-renderizar ni recrear los emisores.
  const selfTypingRef = useRef(false); // ¿ya emitimos isTyping:true?
  const selfStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const guestSafetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // El id vigente evita que emisores capturados por un closure viejo emitan
  // typing en la conversación equivocada tras cambiar de hilo.
  const convIdRef = useRef(conversationId);
  convIdRef.current = conversationId;

  const emitTyping = useCallback((isTyping: boolean) => {
    const convId = convIdRef.current;
    const token = localStorage.getItem("token");
    if (!convId || !token) return;
    getSocket(token).emit("chat:typing", { conversationId: convId, isTyping });
  }, []);

  // Se llama en cada tecla. Emite isTyping:true UNA sola vez por ráfaga (en el
  // flanco false->true) y reprograma el corte a los 2s de la última tecla.
  const notifyTyping = useCallback(() => {
    if (!selfTypingRef.current) {
      selfTypingRef.current = true;
      emitTyping(true);
    }
    if (selfStopTimerRef.current) clearTimeout(selfStopTimerRef.current);
    selfStopTimerRef.current = setTimeout(() => {
      selfTypingRef.current = false;
      emitTyping(false);
    }, TYPING_STOP_MS);
  }, [emitTyping]);

  // Corte inmediato del "escribiendo…" propio (al enviar).
  const stopTyping = useCallback(() => {
    if (selfStopTimerRef.current) {
      clearTimeout(selfStopTimerRef.current);
      selfStopTimerRef.current = null;
    }
    if (selfTypingRef.current) {
      selfTypingRef.current = false;
      emitTyping(false);
    }
  }, [emitTyping]);

  useEffect(() => {
    if (!conversationId) return;
    const token = localStorage.getItem("token");
    if (!token) return;

    const socket = getSocket(token);

    // Cambió el hilo: arrancamos sin typing/presencia hasta que llegue el
    // snapshot del server.
    setGuestTyping(false);
    setGuestOnline(false);

    // Entramos al room y marcamos como leído lo que ya está en pantalla.
    const join = () => {
      socket.emit("chat:join", { conversationId });
      socket.emit("chat:read", { conversationId });
    };
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

      // Mensaje del guest con el hilo abierto -> lo marcamos leído en vivo y
      // ocultamos su "escribiendo…" (mandó, ya no tipea).
      if (msg.sender === "GUEST") {
        socket.emit("chat:read", { conversationId });
        setGuestTyping(false);
        if (guestSafetyTimerRef.current)
          clearTimeout(guestSafetyTimerRef.current);
      }

      // Reordenar bandeja + preview + badge.
      queryClient.invalidateQueries({ queryKey: chatKeys.conversations });
    };

    const handleTyping = (evt: TypingEvent) => {
      if (evt.conversationId !== conversationId || evt.from !== "GUEST") return;
      setGuestTyping(evt.isTyping);
      if (guestSafetyTimerRef.current) clearTimeout(guestSafetyTimerRef.current);
      if (evt.isTyping) {
        // Red de seguridad: si no llega el isTyping:false, lo ocultamos igual.
        guestSafetyTimerRef.current = setTimeout(
          () => setGuestTyping(false),
          TYPING_SAFETY_MS,
        );
      }
    };

    const handlePresence = (evt: PresenceEvent) => {
      if (evt.conversationId !== conversationId || evt.party !== "GUEST") return;
      setGuestOnline(evt.online);
    };

    // El guest leyó MIS mensajes: marco "visto" los OPERATOR con createdAt<=readAt.
    const handleRead = (evt: ReadEvent) => {
      if (evt.conversationId !== conversationId || evt.reader !== "GUEST")
        return;
      const readAtMs = new Date(evt.readAt).getTime();
      queryClient.setQueryData<MessageDTO[]>(
        chatKeys.messages(conversationId),
        (prev) => {
          if (!prev) return prev;
          let changed = false;
          const next = prev.map((m) => {
            if (
              m.sender === "OPERATOR" &&
              m.readAt == null &&
              new Date(m.createdAt).getTime() <= readAtMs
            ) {
              changed = true;
              return { ...m, readAt: evt.readAt };
            }
            return m;
          });
          return changed ? next : prev;
        },
      );
    };

    socket.on("chat:message", handleMessage);
    socket.on("chat:typing", handleTyping);
    socket.on("chat:presence", handlePresence);
    socket.on("chat:read", handleRead);

    return () => {
      socket.emit("chat:leave", { conversationId });
      socket.off("chat:message", handleMessage);
      socket.off("chat:typing", handleTyping);
      socket.off("chat:presence", handlePresence);
      socket.off("chat:read", handleRead);
      socket.off("connect", join);
      if (guestSafetyTimerRef.current) clearTimeout(guestSafetyTimerRef.current);
      // Si salíamos tipeando, avisamos el corte al otro lado.
      if (selfStopTimerRef.current) {
        clearTimeout(selfStopTimerRef.current);
        selfStopTimerRef.current = null;
      }
      if (selfTypingRef.current) {
        selfTypingRef.current = false;
        socket.emit("chat:typing", { conversationId, isTyping: false });
      }
    };
  }, [conversationId, queryClient]);

  return { guestTyping, guestOnline, notifyTyping, stopTyping };
};

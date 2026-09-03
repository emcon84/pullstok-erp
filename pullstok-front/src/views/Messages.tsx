import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Bell, Check, CheckCheck, MessageSquare, Send } from "lucide-react";
import { toast } from "react-toastify";
import { ensureNotificationPermission } from "../lib/notify";
import {
  clearEscalated,
  useEscalatedConversations,
} from "../stores/escalatedConversations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Loader } from "../components/atoms/loader";
import {
  useConversations,
  useMessages,
  useSendMessage,
} from "../components/hooks/useChat";
import { useChatThreadRealtime } from "../components/hooks/useChatRealtime";
import type {
  ConversationDTO,
  MessageDTO,
} from "../services/chatService";

const formatTime = (date: string | null) => {
  if (!date) return "";
  return new Date(date).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatListTime = (date: string | null) => {
  if (!date) return "";
  const d = new Date(date);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  return isToday
    ? d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
};

// El label del cliente. Para WhatsApp mostramos el teléfono (E.164 sin
// espacios) en lugar del guestEmail sintético; si no hay teléfono, caemos al
// guestName/guestEmail. Para el widget web, el guestName/guestEmail normal.
const guestLabel = (c: ConversationDTO) => {
  if (c.channel === "WHATSAPP" && c.guestPhone) return c.guestPhone;
  return c.guestName?.trim() || c.guestEmail?.trim() || "Invitado";
};

const guestInitial = (c: ConversationDTO) =>
  (guestLabel(c)[0] ?? "?").toUpperCase();

export const Messages: React.FC = () => {
  const { data: conversations, isLoading, error } = useConversations();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = conversations ?? [];

  // Pedimos permiso de notificaciones al entrar a Mensajes (no en cada carga de
  // la app): acá el operador ya mostró intención de atender el chat.
  useEffect(() => {
    void ensureNotificationPermission();
  }, []);

  // Al abrir una conversación limpiamos su flag de "pide atención".
  const handleSelect = (id: string) => {
    clearEscalated(id);
    setSelectedId(id);
  };

  // Auto-seleccionar la primera conversación en desktop la primera vez.
  useEffect(() => {
    if (selectedId || list.length === 0) return;
    if (typeof window !== "undefined" && window.innerWidth >= 768) {
      setSelectedId(list[0].id);
    }
  }, [list, selectedId]);

  const selected = useMemo(
    () => list.find((c) => c.id === selectedId) ?? null,
    [list, selectedId],
  );

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        Error: {error.message}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mensajes</h1>
        <p className="text-sm text-muted-foreground">
          {list.length} conversaci{list.length === 1 ? "ón" : "ones"}
        </p>
      </div>

      <div className="flex h-[calc(100vh-12rem)] overflow-hidden rounded-lg border bg-card">
        {/* Panel lista */}
        <aside
          className={cn(
            "w-full flex-col border-r md:flex md:w-80 lg:w-96",
            selected ? "hidden md:flex" : "flex",
          )}
        >
          <ConversationList
            conversations={list}
            selectedId={selectedId}
            onSelect={handleSelect}
          />
        </aside>

        {/* Panel hilo */}
        <section
          className={cn(
            "min-w-0 flex-1 flex-col",
            selected ? "flex" : "hidden md:flex",
          )}
        >
          {selected ? (
            <ChatThread
              conversation={selected}
              onBack={() => setSelectedId(null)}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
              <MessageSquare className="h-10 w-10 opacity-40" />
              <p className="text-sm">
                Seleccioná una conversación para ver el chat.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

interface ConversationListProps {
  conversations: ConversationDTO[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  selectedId,
  onSelect,
}) => {
  const escalated = useEscalatedConversations();

  if (conversations.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
        <MessageSquare className="h-10 w-10 opacity-40" />
        <p className="text-sm">Todavía no hay conversaciones.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {conversations.map((c) => {
        const active = c.id === selectedId;
        const needsHuman = escalated.has(c.id);
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.id)}
            className={cn(
              "flex w-full items-start gap-3 border-b px-4 py-3 text-left transition-colors",
              active ? "bg-muted" : "hover:bg-muted/50",
              needsHuman && "bg-amber-50 dark:bg-amber-950/30",
            )}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold uppercase text-accent-foreground">
              {guestInitial(c)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="flex min-w-0 items-center gap-1.5 truncate text-sm font-medium">
                  {needsHuman && (
                    <Bell
                      className="h-3.5 w-3.5 shrink-0 text-amber-500"
                      aria-label="Pide atención"
                    />
                  )}
                  <span className="truncate">{guestLabel(c)}</span>
                  {c.channel === "WHATSAPP" && (
                    <Badge
                      variant="secondary"
                      className="h-4 shrink-0 px-1.5 text-[9px] leading-none"
                    >
                      WhatsApp
                    </Badge>
                  )}
                </p>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatListTime(c.lastMessageAt)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs text-muted-foreground">
                  {c.lastMessage
                    ? `${c.lastMessage.sender === "OPERATOR" ? "Vos: " : ""}${c.lastMessage.body}`
                    : "Sin mensajes"}
                </p>
                {c.unreadCount > 0 && (
                  <Badge
                    variant="destructive"
                    className="h-5 min-w-5 shrink-0 px-1.5 text-xs"
                  >
                    {c.unreadCount}
                  </Badge>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};

interface ChatThreadProps {
  conversation: ConversationDTO;
  onBack: () => void;
}

const ChatThread: React.FC<ChatThreadProps> = ({ conversation, onBack }) => {
  const convId = conversation.id;
  const { data: messages, isLoading } = useMessages(convId);
  const { sendMessage, loading: sending } = useSendMessage();
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Suscripción socket a ESTA conversación (join/leave + append de mensajes)
  // + indicadores PRO (Fase D): escribiendo, presencia y visto.
  const { guestTyping, guestOnline, notifyTyping, stopTyping } =
    useChatThreadRealtime(convId);

  const list = messages ?? [];

  // Id del último mensaje MÍO (OPERATOR) que el guest ya vio, para pintar el
  // "Visto" una sola vez, bajo la última burbuja leída.
  const lastSeenOperatorId = useMemo(() => {
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      if (m.sender === "OPERATOR" && m.readAt) return m.id;
    }
    return null;
  }, [list]);

  // Autoscroll al fondo cuando cambian los mensajes, la conversación o aparece
  // el indicador "escribiendo…".
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [list.length, convId, guestTyping]);

  const handleSend = () => {
    const body = draft.trim();
    if (!body || sending) return;
    stopTyping();
    sendMessage(
      { conversationId: convId, body },
      {
        onError: () => toast.error("No se pudo enviar el mensaje"),
      },
    );
    setDraft("");
  };

  const handleDraftChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>,
  ) => {
    setDraft(e.target.value);
    if (e.target.value.trim()) notifyTyping();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter envía; Shift+Enter hace salto de línea.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header del hilo */}
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={onBack}
          aria-label="Volver"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold uppercase text-accent-foreground">
          {guestInitial(conversation)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {guestLabel(conversation)}
          </p>
          <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            <span
              className={cn(
                "inline-block h-2 w-2 shrink-0 rounded-full",
                guestOnline ? "bg-green-500" : "bg-muted-foreground/40",
              )}
              aria-hidden
            />
            <span className="shrink-0">
              {guestOnline ? "En línea" : "Desconectado"}
            </span>
            {conversation.channel === "WHATSAPP" ? (
              conversation.guestPhone && (
                <span className="truncate">· {conversation.guestPhone}</span>
              )
            ) : (
              conversation.guestEmail && (
                <span className="truncate">· {conversation.guestEmail}</span>
              )
            )}
            {conversation.channel === "WHATSAPP" && (
              <Badge
                variant="secondary"
                className="h-5 shrink-0 px-1.5 text-[10px] leading-none"
              >
                WhatsApp
              </Badge>
            )}
          </p>
        </div>
      </div>

      {/* Mensajes */}
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader />
          </div>
        ) : list.length === 0 && !guestTyping ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <MessageSquare className="h-8 w-8 opacity-40" />
            <p className="text-sm">Todavía no hay mensajes en esta conversación.</p>
          </div>
        ) : (
          <>
            {list.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                seen={m.id === lastSeenOperatorId}
              />
            ))}
            {guestTyping && <TypingIndicator />}
          </>
        )}
      </div>

      {/* Input */}
      <div className="flex items-end gap-2 border-t p-3">
        <Textarea
          value={draft}
          onChange={handleDraftChange}
          onKeyDown={handleKeyDown}
          placeholder="Escribí una respuesta…"
          className="max-h-32 min-h-[2.5rem] flex-1 resize-none"
          rows={1}
        />
        <Button
          onClick={handleSend}
          disabled={!draft.trim() || sending}
          size="icon"
          aria-label="Enviar"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

const MessageBubble: React.FC<{ message: MessageDTO; seen?: boolean }> = ({
  message,
  seen,
}) => {
  const isOperator = message.sender === "OPERATOR";
  return (
    <div
      className={cn(
        "flex w-full",
        isOperator ? "justify-end" : "justify-start",
      )}
    >
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm",
          isOperator
            ? "rounded-br-sm bg-primary text-primary-foreground"
            : "rounded-bl-sm bg-muted text-foreground",
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.body}</p>
        <div
          className={cn(
            "mt-1 flex items-center justify-end gap-1 text-[10px]",
            isOperator
              ? "text-primary-foreground/70"
              : "text-muted-foreground",
          )}
        >
          <span>{formatTime(message.createdAt)}</span>
          {isOperator &&
            (seen ? (
              <span className="flex items-center gap-0.5">
                <CheckCheck className="h-3 w-3" />
                Visto
              </span>
            ) : (
              <Check className="h-3 w-3" />
            ))}
        </div>
      </div>
    </div>
  );
};

// "Escribiendo…" del cliente: tres puntitos animados en una burbuja tipo
// mensaje entrante (izquierda), consistente con el hilo.
const TypingIndicator: React.FC = () => (
  <div className="flex justify-start">
    <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-muted px-3 py-3 shadow-sm">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60" />
    </div>
  </div>
);

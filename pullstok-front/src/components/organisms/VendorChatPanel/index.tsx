import { useState, useRef, useEffect, useCallback, type MouseEvent } from "react";
import { MessageSquare, Send, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useGetMessages,
} from "@/hooks/useVendorChat";
import { useConfirm } from "@/components/hooks/useConfirm";
import type { VendorChat } from "@/services/vendorChatService";

interface VendorChatPanelProps {
  conversation: VendorChat;
  onSendMessage: (body: string) => void;
  isTyping?: boolean;
  /** Avisa al padre que ya llegó la respuesta del asistente (apaga el "escribiendo…"). */
  onAssistantReply?: () => void;
}

// Solo el área de mensajes + composer: el header (título, volver, badge de
// estado) vive en VendorChatWidget, compartido con la lista de conversaciones.
export function VendorChatPanel({
  conversation,
  onSendMessage,
  isTyping = false,
  onAssistantReply,
}: VendorChatPanelProps) {
  const [draft, setDraft] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const messagesQuery = useGetMessages(conversation.id);

  const messages = messagesQuery.data ?? [];
  const isLoadingMessages = messagesQuery.isLoading;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // El bot responde fire-and-forget en el backend: recién sabemos que
  // contestó cuando el polling (useGetMessages) trae un mensaje nuevo del
  // ASSISTANT. Antes el "escribiendo…" se apagaba apenas se enviaba el
  // mensaje del vendedor, sin esperar la respuesta real.
  useEffect(() => {
    if (!isTyping) return;
    const last = messages[messages.length - 1];
    if (last?.sender === "ASSISTANT") {
      onAssistantReply?.();
    }
  }, [messages, isTyping, onAssistantReply]);

  const handleSend = useCallback(() => {
    const body = draft.trim();
    if (!body) return;
    onSendMessage(body);
    setDraft("");
    inputRef.current?.focus();
  }, [draft, onSendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSend();
    }
  };

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {isLoadingMessages && (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoadingMessages && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center space-y-2">
            <MessageSquare className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Escribile al asistente para empezar
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${
              msg.sender === "SELLER" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                msg.sender === "SELLER"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground"
              }`}
            >
              {msg.body}
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-2xl px-3.5 py-2.5 flex items-center gap-1">
              <span className="flex gap-1">
                <span
                  className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce"
                  style={{ animationDelay: "0ms" }}
                />
                <span
                  className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce"
                  style={{ animationDelay: "150ms" }}
                />
                <span
                  className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce"
                  style={{ animationDelay: "300ms" }}
                />
              </span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {conversation.status === "ACTIVE" && (
        <div className="flex shrink-0 items-center gap-2 border-t px-4 py-3">
          <Input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribí al asistente…"
            className="flex-1"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!draft.trim()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

export function VendorChatFAB({
  onClick,
  unreadCount = 0,
}: {
  onClick: () => void;
  unreadCount?: number;
}) {
  return (
    <button
      onClick={onClick}
      className="relative flex items-center gap-2 rounded-full bg-primary px-5 py-3.5 text-primary-foreground shadow-lg hover:bg-primary/90 transition-all active:scale-95 touch-manipulation"
      aria-label="Abrir asistente de ventas"
    >
      {unreadCount > 0 && (
        <>
          <span className="absolute inset-0 -m-3 animate-ping rounded-full bg-primary/20" />
          <span className="absolute inset-0 -m-6 animate-ping rounded-full bg-primary/10 [animation-delay:300ms]" />
        </>
      )}
      <MessageSquare className="h-5 w-5" />
      {unreadCount > 0 && (
        <span className="font-semibold text-sm">{unreadCount}</span>
      )}
    </button>
  );
}

interface ChatListPanelProps {
  chats: VendorChat[];
  error?: string;
  onSelect: (chat: VendorChat) => void;
  onDelete: (id: string) => void;
}

const formatChatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "short" });

export function ChatListPanel({ chats, error, onSelect, onDelete }: ChatListPanelProps) {
  const confirm = useConfirm();

  const handleDelete = async (e: MouseEvent, chatId: string) => {
    e.stopPropagation();
    const ok = await confirm({
      title: "¿Eliminar conversación?",
      description: "Se borra la conversación y todos sus mensajes. Esta acción no se puede deshacer.",
      confirmLabel: "Sí, eliminar",
      danger: true,
    });
    if (ok) onDelete(chatId);
  };

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {error && (
        <p className="shrink-0 border-b bg-destructive/10 px-4 py-2 text-xs text-destructive">
          No se pudieron cargar las conversaciones: {error}
        </p>
      )}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1 min-h-0">
        {chats.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-16 text-center space-y-2 px-6">
            <MessageSquare className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Sin conversaciones todavía. Creá una con el botón "+" de arriba.
            </p>
          </div>
        )}
        {chats.map((chat) => (
          <div
            key={chat.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(chat)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(chat);
              }
            }}
            className="group flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    chat.status === "ACTIVE" ? "bg-emerald-500" : "bg-muted-foreground/40"
                  }`}
                />
                <span className="text-sm font-medium">
                  {chat.status === "ACTIVE" ? "Conversación activa" : "Conversación cerrada"}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {chat._count?.messages ?? 0} mensaje{(chat._count?.messages ?? 0) !== 1 ? "s" : ""} · {formatChatDate(chat.updatedAt)}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground opacity-100 transition-opacity hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
              title="Eliminar conversación"
              onClick={(e) => handleDelete(e, chat.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

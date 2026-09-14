import { useState, useRef, useEffect, useCallback } from "react";
import { MessageSquare, Send, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  useGetMessages,
  useSendVendorMessage,
  type VendorChat,
} from "@/hooks/useVendorChat";

interface VendorChatPanelProps {
  conversation?: VendorChat | null;
  onSendMessage: (body: string) => void;
  isTyping?: boolean;
}

export function VendorChatPanel({
  conversation,
  onSendMessage,
  isTyping = false,
}: VendorChatPanelProps) {
  const [draft, setDraft] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const messagesQuery = useGetMessages(conversation?.id ?? null);
  const sendMsg = useSendVendorMessage();

  const messages = messagesQuery.data ?? [];
  const isLoadingMessages = messagesQuery.isLoading;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const handleSend = useCallback(() => {
    const body = draft.trim();
    if (!body || !conversation) return;
    onSendMessage(body);
    sendMsg.mutate(
      { conversationId: conversation.id, sender: "SELLER", body },
      {
        onSuccess: () => setDraft(""),
      },
    );
    inputRef.current?.focus();
  }, [draft, conversation, onSendMessage, sendMsg]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      <SheetHeader className="px-0 pb-3 border-b">
        <SheetTitle className="flex items-center justify-between text-base">
          <span>Asistente de ventas</span>
          {conversation && (
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                conversation.status === "ACTIVE"
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {conversation.status === "ACTIVE" ? "Activa" : "Cerrada"}
            </span>
          )}
        </SheetTitle>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto space-y-2 py-3 min-h-0">
        {isLoadingMessages && (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!conversation && !isLoadingMessages && (
          <div className="flex flex-col items-center justify-center py-12 text-center space-y-2">
            <MessageSquare className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Iniciá una conversación con el asistente de ventas
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
              className={`max-w-[80%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
                msg.sender === "SELLER"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {msg.body}
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-lg px-3 py-2 flex items-center gap-1">
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

      {conversation && conversation.status === "ACTIVE" && (
        <div className="flex gap-2 pt-3 border-t">
          <Input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribí al asistente…"
            className="flex-1"
          />
          <Button
            size="sm"
            onClick={handleSend}
            disabled={!draft.trim() || sendMsg.isPending}
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
  onSelect: (chat: VendorChat) => void;
  onCreate: () => void;
}

export function ChatListPanel({ chats, onSelect, onCreate }: ChatListPanelProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-1 pb-3 flex items-center justify-between border-b">
        <span className="text-sm text-muted-foreground">
          {chats.length} conversación{chats.length !== 1 ? "es" : ""}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCreate}
          disabled={chats.length > 0}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto space-y-1 py-2">
        {chats.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center space-y-2">
            <MessageSquare className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Sin conversaciones. Creá una para empezar.
            </p>
          </div>
        )}
        {chats.map((chat) => (
          <button
            key={chat.id}
            onClick={() => onSelect(chat)}
            className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {chat.status === "ACTIVE" ? "Activa" : "Cerrada"}
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(chat.updatedAt).toLocaleDateString("es-AR")}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              {chat._count?.messages ?? 0} mensajes
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

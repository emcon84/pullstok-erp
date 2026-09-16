import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  useCreateVendorChat,
  useDeleteVendorChat,
  useListVendorChats,
  useSendVendorMessage,
} from "@/hooks/useVendorChat";
import {
  ChatListPanel,
  VendorChatFAB,
  VendorChatPanel,
} from "@/components/organisms/VendorChatPanel";
import type { VendorChat } from "@/services/vendorChatService";

interface VendorChatWidgetProps {
  sellerId: string;
}

const formatChatMeta = (iso: string) =>
  new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

// El bot responde fire-and-forget en el backend (hasta 2 intentos de 15s c/u
// contra Groq). Si no llega nada en este lapso, se apaga el "escribiendo…"
// para no dejarlo tildado — el mensaje, si igual llega tarde, lo trae el
// polling de todos modos.
const TYPING_SAFETY_TIMEOUT_MS = 35000;

export function VendorChatWidget({ sellerId }: VendorChatWidgetProps) {
  const [chatOpen, setChatOpen] = useState(false);
  const [selectedChat, setSelectedChat] = useState<VendorChat | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: vendorChatsData, error: listError } = useListVendorChats();
  const createChat = useCreateVendorChat();
  const deleteChat = useDeleteVendorChat();
  const sendChatMessage = useSendVendorMessage();

  const clearTypingTimeout = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
  }, []);

  const stopTyping = useCallback(() => {
    clearTypingTimeout();
    setIsTyping(false);
  }, [clearTypingTimeout]);

  useEffect(() => clearTypingTimeout, [clearTypingTimeout]);

  const openChat = useCallback(() => {
    setChatOpen(true);
  }, []);

  const handleCreateChat = useCallback(async () => {
    try {
      const created = await createChat.mutateAsync({ sellerId });
      setSelectedChat(created);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo crear la conversación");
    }
  }, [createChat, sellerId]);

  const handleDeleteChat = useCallback(
    async (id: string) => {
      try {
        await deleteChat.mutateAsync(id);
        setSelectedChat((prev) => (prev?.id === id ? null : prev));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "No se pudo eliminar la conversación");
      }
    },
    [deleteChat],
  );

  const handleSendChatMessage = useCallback(
    async (body: string) => {
      if (!selectedChat) return;
      setIsTyping(true);
      clearTypingTimeout();
      typingTimeoutRef.current = setTimeout(stopTyping, TYPING_SAFETY_TIMEOUT_MS);
      try {
        await sendChatMessage.mutateAsync({
          conversationId: selectedChat.id,
          sender: "SELLER",
          body,
        });
      } catch (error) {
        stopTyping();
        toast.error(error instanceof Error ? error.message : "No se pudo enviar el mensaje");
      }
    },
    [selectedChat, sendChatMessage, clearTypingTimeout, stopTyping],
  );

  return (
    <>
      {/* ── Chat FAB ── */}
      <div className="fixed bottom-24 right-6 z-50">
        <VendorChatFAB onClick={openChat} />
      </div>

      {/* ── Chat slide-over ── */}
      <Sheet open={chatOpen} onOpenChange={setChatOpen}>
        <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          {/* Título accesible (visualmente oculto): el header real de abajo
              ya muestra "Asistente de ventas" con el resto del contexto. */}
          <SheetTitle className="sr-only">Asistente de ventas</SheetTitle>

          {/* Header único y fijo — reemplaza al "Nuevo" ambiguo de antes:
              adentro de un chat, la flecha vuelve a la lista de conversaciones
              (antes no había forma clara de "salir" del chat sin cerrar todo). */}
          <div className="flex shrink-0 items-center gap-2 border-b py-3 pl-4 pr-12">
            {selectedChat ? (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="-ml-2 h-8 w-8 shrink-0"
                  title="Volver a conversaciones"
                  onClick={() => setSelectedChat(null)}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold leading-tight">
                    Asistente de ventas
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatChatMeta(selectedChat.createdAt)}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    selectedChat.status === "ACTIVE"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {selectedChat.status === "ACTIVE" ? "Activa" : "Cerrada"}
                </span>
              </>
            ) : (
              <>
                <p className="flex-1 text-sm font-semibold">Asistente de ventas</p>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  title="Nueva conversación"
                  onClick={handleCreateChat}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>

          {selectedChat ? (
            <VendorChatPanel
              conversation={selectedChat}
              onSendMessage={handleSendChatMessage}
              isTyping={isTyping}
              onAssistantReply={stopTyping}
            />
          ) : (
            <ChatListPanel
              chats={vendorChatsData ?? []}
              error={listError?.message}
              onSelect={setSelectedChat}
              onDelete={handleDeleteChat}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

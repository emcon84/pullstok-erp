import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  useCreateVendorChat,
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

export function VendorChatWidget({ sellerId }: VendorChatWidgetProps) {
  const [chatOpen, setChatOpen] = useState(false);
  const [selectedChat, setSelectedChat] = useState<VendorChat | null>(null);
  const [isTyping, setIsTyping] = useState(false);

  const { data: vendorChatsData } = useListVendorChats();
  const createChat = useCreateVendorChat();
  const sendChatMessage = useSendVendorMessage();

  const openChat = useCallback(() => {
    setChatOpen(true);
  }, []);

  const handleSendChatMessage = useCallback(
    async (body: string) => {
      if (!selectedChat) return;
      setIsTyping(true);
      try {
        await sendChatMessage.mutateAsync({
          conversationId: selectedChat.id,
          sender: "SELLER",
          body,
        });
      } finally {
        setIsTyping(false);
      }
    },
    [selectedChat, sendChatMessage],
  );

  return (
    <>
      {/* ── Chat FAB ── */}
      <div className="fixed bottom-24 right-6 z-50">
        <VendorChatFAB onClick={openChat} />
      </div>

      {/* ── Chat slide-over ── */}
      <Sheet open={chatOpen} onOpenChange={setChatOpen}>
        <SheetContent className="w-full sm:max-w-md flex flex-col">
          {selectedChat ? (
            <>
              <div className="flex items-center justify-between pb-3 border-b">
                <SheetTitle className="text-sm">
                  Chat #{selectedChat.id.slice(-6)}
                </SheetTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedChat(null);
                  }}
                >
                  Nuevo
                </Button>
              </div>
              <VendorChatPanel
                conversation={selectedChat}
                onSendMessage={handleSendChatMessage}
                isTyping={isTyping}
              />
            </>
          ) : (
            <>
              <SheetHeader>
                <SheetTitle>Asistente de ventas</SheetTitle>
              </SheetHeader>
              <ChatListPanel
                chats={vendorChatsData ?? []}
                onSelect={(chat) => {
                  setSelectedChat(chat);
                }}
                onCreate={async () => {
                  const created = await createChat.mutateAsync({ sellerId });
                  setSelectedChat(created);
                }}
              />
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

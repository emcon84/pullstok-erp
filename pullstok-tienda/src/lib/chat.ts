// Persistencia client-side de la sesión de chat del visitante (mismo patrón que
// cart.ts: nanostores + @nanostores/persistent → localStorage). Guardamos lo
// mínimo para RETOMAR la conversación si el visitante recarga o vuelve más
// tarde: conversationId, el guest token y el email con el que arrancó.
//
// El email se guarda a propósito: al volver, re-llamamos POST /api/chat/start
// con ese email → el backend reusa la conversación OPEN, refresca el token
// (que expira a 7d) y nos devuelve el historial de mensajes. Es la vía más
// robusta de reanudar sin persistir todo el hilo en el browser.
import { persistentAtom } from "@nanostores/persistent";

export interface ChatSession {
  conversationId: string;
  token: string;
  email: string;
  name: string;
}

function encode(session: ChatSession | null): string {
  return session ? JSON.stringify(session) : "";
}

function decode(raw: string): ChatSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.token === "string" && typeof parsed.conversationId === "string") {
      return parsed as ChatSession;
    }
    return null;
  } catch {
    return null;
  }
}

// Prefijo "pullstok-tienda:" igual que el carrito, para no colisionar en
// localStorage con otras apps del mismo dominio.
export const chatSession = persistentAtom<ChatSession | null>(
  "pullstok-tienda:chat",
  null,
  { encode, decode },
);

export function setChatSession(session: ChatSession) {
  chatSession.set(session);
}

export function clearChatSession() {
  chatSession.set(null);
}

// Espeja MessageDTO del backend (api/src/services/chatService.ts). El widget
// solo necesita estos campos para renderizar el hilo.
export interface ChatMessage {
  id: string;
  conversationId: string;
  sender: "GUEST" | "OPERATOR";
  body: string;
  senderUserId: string | null;
  readAt: string | null;
  createdAt: string;
}

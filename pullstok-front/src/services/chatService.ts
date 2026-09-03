import axios from "axios";
import { API_URL } from "../constants";

/**
 * Contrato REST del chat (Fases A/B del backend, ya implementado y verificado).
 * Auth: mismo Bearer JWT que el resto de los services.
 */

export type ChatSender = "GUEST" | "OPERATOR";

export interface MessageDTO {
  id: string;
  conversationId: string;
  sender: ChatSender;
  senderUserId: string | null;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export interface ConversationDTO {
  id: string;
  guestName: string | null;
  guestEmail: string | null;
  customerId: string | null;
  // Canal de origen (WEB = widget tienda, WHATSAPP = Kapso) y teléfono del
  // cliente para WhatsApp. Permite distinguir y mostrar el número real.
  channel: "WEB" | "WHATSAPP" | null;
  guestPhone: string | null;
  status: string;
  lastMessageAt: string | null;
  createdAt: string;
  lastMessage: MessageDTO | null;
  unreadCount: number;
}

const authHeaders = () => {
  const token = localStorage.getItem("token");
  return { Authorization: `Bearer ${token}` };
};

// Lista de conversaciones (ordenadas por lastMessageAt desc por el backend).
export const getConversations = async (): Promise<ConversationDTO[]> => {
  const response = await axios.get<ConversationDTO[]>(
    `${API_URL}/chat/conversations`,
    { headers: authHeaders() },
  );
  return response.data;
};

// Mensajes de una conversación. El backend además marca como leídos los
// mensajes del guest al pedir este endpoint.
export const getMessages = async (
  conversationId: string,
): Promise<MessageDTO[]> => {
  const response = await axios.get<MessageDTO[]>(
    `${API_URL}/chat/conversations/${conversationId}/messages`,
    { headers: authHeaders() },
  );
  return response.data;
};

// El operador responde. Devuelve el MessageDTO creado (201).
export const sendMessage = async (
  conversationId: string,
  body: string,
): Promise<MessageDTO> => {
  const response = await axios.post<MessageDTO>(
    `${API_URL}/chat/conversations/${conversationId}/messages`,
    { body },
    { headers: authHeaders() },
  );
  return response.data;
};

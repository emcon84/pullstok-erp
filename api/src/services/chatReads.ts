import { MessageSender } from "@prisma/client";
import { prisma } from "../config/db";

/**
 * Marcado de "visto" (read receipts) — FASE D.
 *
 * Lógica CENTRALIZADA de marcar mensajes como leídos, reutilizada por:
 *  - el GET REST del operador (chatService.getConversationMessages)
 *  - el handler de socket `chat:read` (realtime/socket.ts)
 *
 * Vive en su PROPIO módulo (no en chatService) a propósito: chatService importa
 * realtime/socket (para emitir). Si el socket importara chatService, se formaría
 * un ciclo runtime (service ↔ realtime). Este módulo solo importa `prisma`, así
 * el socket lo puede usar sin romper la regla "service → realtime unidireccional".
 *
 * Message NO es tenant-model (ver TENANT_MODELS en config/db.ts): la extensión
 * anti-fuga no lo scopea, por lo que este updateMany funciona SIN tenant context
 * (indispensable en los handlers de socket, que no corren dentro de runWithTenant).
 * La pertenencia (conv de la org / conv del guest) se valida ANTES de llamar acá.
 */

/**
 * Marca `readAt = now` en los mensajes SIN LEER que envió la CONTRAPARTE del
 * lector. Si lee el OPERATOR → marca los mensajes GUEST; si lee el GUEST → marca
 * los del OPERATOR. Nunca marca los propios (por eso filtra por `sender` de la
 * contraparte) ni re-marca los ya leídos (`readAt: null`), evitando pisar
 * timestamps previos y contar de más.
 *
 * Devuelve el `readAt` aplicado para que el emisor del evento lo propague.
 */
export const markRead = async (
  conversationId: string,
  readerRole: MessageSender,
): Promise<Date> => {
  const counterparty: MessageSender =
    readerRole === "OPERATOR" ? "GUEST" : "OPERATOR";
  const readAt = new Date();
  await prisma.message.updateMany({
    where: { conversationId, sender: counterparty, readAt: null },
    data: { readAt },
  });
  return readAt;
};

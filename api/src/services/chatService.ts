import { Message, MessageSender } from "@prisma/client";
import { prisma } from "../config/db";
import { requireOrganizationId } from "../config/tenantContext";
// Marcado de "visto" centralizado (FASE D). En módulo aparte para que el socket
// pueda reusarlo sin importar chatService (evita ciclo service ↔ realtime).
import { markRead } from "./chatReads";
// Helpers de emisión del socket. Import UNIDIRECCIONAL (service → realtime): el
// módulo realtime NO importa este service en runtime → sin ciclo. Mismo patrón
// que emitOrdersChanged.
import { emitChatMessage, emitConversationUpdated } from "../realtime/socket";

/**
 * Lógica de dominio del chat cliente↔operador (FASE A).
 *
 * TODAS las funciones asumen que ya hay contexto de tenant activo
 * (runWithTenant) — lo pone authMiddleware (operador) o requireGuest/tenantBySlug
 * (guest). Así la extensión anti-fuga de Prisma scopea Conversation por org
 * automáticamente. Message NO es tenant-model: se scopea SIEMPRE vía un
 * conversationId que ya fue validado contra la org (nunca uno crudo del body).
 *
 * FASE B (tiempo real): persistMessage es el único punto de escritura de
 * mensajes → enganchar acá el emit del socket (io.to(room).emit(...)) sin tocar
 * los controllers.
 */

// DTO estable de mensaje para el front (mismo shape en guest y operador).
export interface MessageDTO {
  id: string;
  conversationId: string;
  sender: MessageSender;
  senderUserId: string | null;
  // true si el mensaje lo generó el bot IA (sender=OPERATOR, senderUserId=null).
  // Deja que la UI del operador distinga una respuesta del bot de la de un humano.
  isBot: boolean;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export const toMessageDTO = (m: Message): MessageDTO => ({
  id: m.id,
  conversationId: m.conversationId,
  sender: m.sender,
  senderUserId: m.senderUserId,
  isBot: m.isBot,
  body: m.body,
  readAt: m.readAt ? m.readAt.toISOString() : null,
  createdAt: m.createdAt.toISOString(),
});

/**
 * Persiste un mensaje y actualiza Conversation.lastMessageAt en una sola
 * transacción. Punto único de creación de mensajes (guest y operador) — el
 * lugar natural para enganchar el emit de socket en FASE B.
 *
 * `conversationId` DEBE haber sido validado como perteneciente a la org actual
 * antes de llamar acá.
 */
export const persistMessage = async (input: {
  conversationId: string;
  sender: MessageSender;
  senderUserId?: string | null;
  // Marca la respuesta como generada por el bot IA (ver botService). Solo tiene
  // sentido con sender=OPERATOR y senderUserId=null. Default false.
  isBot?: boolean;
  body: string;
}): Promise<Message> => {
  const now = new Date();
  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.message.create({
      data: {
        conversationId: input.conversationId,
        sender: input.sender,
        senderUserId: input.senderUserId ?? null,
        isBot: input.isBot ?? false,
        body: input.body,
        // Los mensajes del operador nacen "leídos" (no cuentan como no-leídos);
        // los del guest nacen sin leer hasta que el operador los abre.
        readAt: input.sender === "OPERATOR" ? now : null,
      },
    });
    // Conversation es tenant-model → update singular está bloqueado por la
    // extensión anti-fuga; se usa updateMany (recibe el scope de org).
    await tx.conversation.updateMany({
      where: { id: input.conversationId },
      data: { lastMessageAt: now },
    });
    return created;
  });

  // FASE B (tiempo real): DESPUÉS de commitear, emitimos por socket. Envuelto en
  // try/catch: un fallo de socket NUNCA debe romper la persistencia ni el
  // response REST (el mensaje ya está guardado). El organizationId sale del
  // tenant context activo (requireOrganizationId), sin query extra.
  try {
    const dto = toMessageDTO(message);
    const organizationId = requireOrganizationId();
    // → room de la conversación: guest + operador que la tenga abierta.
    emitChatMessage(message.conversationId, dto);
    // → room de la org: refresco de lista/badge de no-leídos de los operadores.
    emitConversationUpdated(organizationId, message.conversationId);
  } catch (err) {
    console.error("[chat] socket emit failed (mensaje persistido igual)", err);
  }

  return message;
};

/**
 * Inicia (o reusa) una conversación para un visitante de la tienda pública.
 * DECISIÓN: si el email ya tiene una conversación OPEN en esta org, se REUSA
 * (el visitante retoma su hilo y ve el historial) en vez de crear una nueva —
 * evita hilos duplicados por la misma persona. Si no, se crea una nueva y, si
 * el email matchea un Customer de la org, se linkea vía customerId.
 *
 * Devuelve la conversación y su historial (vacío en una conversación nueva).
 */
export const startConversation = async (input: {
  name: string;
  email: string;
}): Promise<{ conversationId: string; messages: Message[] }> => {
  const existing = await prisma.conversation.findFirst({
    where: { guestEmail: input.email, status: "OPEN" },
    orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } },
  });

  if (existing) {
    const messages = await prisma.message.findMany({
      where: { conversationId: existing.id },
      orderBy: { createdAt: "asc" },
    });
    return { conversationId: existing.id, messages };
  }

  // Link opcional a Customer por email (Customer es tenant-model → scoped).
  const customer = await prisma.customer.findFirst({
    where: { email: input.email },
    select: { id: true },
  });

  // organizationId explícito para satisfacer los tipos de Prisma (la extensión
  // anti-fuga igual lo inyecta/sobrescribe en runtime — mismo patrón que
  // storeController.checkout con tx.customer.create).
  const conversation = await prisma.conversation.create({
    data: {
      organizationId: requireOrganizationId(),
      guestName: input.name,
      guestEmail: input.email,
      customerId: customer?.id ?? null,
      status: "OPEN",
    },
  });

  return { conversationId: conversation.id, messages: [] };
};

/**
 * Lista las conversaciones de la org (scope automático), ordenadas por último
 * mensaje desc, con el último mensaje y el conteo de mensajes de GUEST sin leer.
 */
export const listConversations = async () => {
  const conversations = await prisma.conversation.findMany({
    orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } },
    include: {
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  if (conversations.length === 0) return [];

  // Conteo de no-leídos en una sola query (Message no es tenant-model → se
  // acota por el set de conversationIds ya scopeados por org arriba).
  const conversationIds = conversations.map((c) => c.id);
  const unreadGroups = await prisma.message.groupBy({
    by: ["conversationId"],
    where: {
      conversationId: { in: conversationIds },
      sender: "GUEST",
      readAt: null,
    },
    _count: { _all: true },
  });
  const unreadByConversation = new Map(
    unreadGroups.map((g) => [g.conversationId, g._count._all]),
  );

  return conversations.map((c) => ({
    id: c.id,
    guestName: c.guestName,
    guestEmail: c.guestEmail,
    customerId: c.customerId,
    status: c.status,
    lastMessageAt: c.lastMessageAt ? c.lastMessageAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
    lastMessage: c.messages[0] ? toMessageDTO(c.messages[0]) : null,
    unreadCount: unreadByConversation.get(c.id) ?? 0,
  }));
};

/**
 * Busca una conversación de la org por id (scope automático). Devuelve null si
 * no existe o pertenece a otra org (ownership implícito por el scope).
 */
export const findOrgConversation = (id: string) =>
  prisma.conversation.findFirst({ where: { id } });

/**
 * Historial de una conversación. Marca como leídos los mensajes de GUEST sin
 * leer (el operador está abriendo la conversación) para que el contador de
 * no-leídos quede en 0. Reusa `markRead` (misma lógica que el socket `chat:read`).
 */
export const getConversationMessages = async (
  conversationId: string,
): Promise<Message[]> => {
  await markRead(conversationId, "OPERATOR");
  return prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
  });
};

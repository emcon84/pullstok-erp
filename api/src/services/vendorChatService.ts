import { prisma } from "../config/db";
import { requireOrganizationId } from "../config/tenantContext";
import { buildProductSearchWhere } from "../controllers/productController";

// Cap de caracteres para el contexto RAG inyectado al bot (spec R3).
const RAG_CHAR_CAP = 5000;

// --- Tipos ---

export interface VendorChatUpsert {
  organizationId?: string;
  sellerId: string;
}

export interface VendorChatListParams {
  organizationId: string;
}

export interface SendMessageInput {
  vendorChatId: string;
  organizationId: string;
  sender: "SELLER" | "ASSISTANT";
  body: string;
  ragContext?: string;
}

// --- CRUD de conversaciones ---

export const createVendorChat = async (input: VendorChatUpsert) => {
  const organizationId = input.organizationId ?? requireOrganizationId();
  return prisma.vendorChat.create({
    data: {
      organizationId,
      sellerId: input.sellerId,
      status: "ACTIVE",
    },
  });
};

export const listVendorChats = async (params: VendorChatListParams) => {
  const organizationId = params.organizationId ?? requireOrganizationId();
  return prisma.vendorChat.findMany({
    where: { organizationId },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { messages: true } } },
  });
};

export const getVendorChatById = async (id: string) => {
  return prisma.vendorChat.findFirst({
    where: { id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
};

export const closeVendorChat = async (id: string) => {
  const chat = await prisma.vendorChat.findFirst({ where: { id } });
  if (!chat) return null;
  if (chat.status === "CLOSED") return chat;
  return prisma.vendorChat.updateMany({
    where: { id },
    data: { status: "CLOSED" },
  });
};

// --- Mensajes ---

export const sendVendorMessage = async (input: SendMessageInput) => {
  const organizationId = input.organizationId ?? requireOrganizationId();
  return prisma.vendorChatMessage.create({
    data: {
      vendorChatId: input.vendorChatId,
      organizationId,
      sender: input.sender,
      body: input.body,
      isBot: input.sender === "ASSISTANT",
      ragContext: input.ragContext ?? null,
    },
  });
};

// --- RAG ---

/**
 * Construye contexto RAG buscando productos relevantes para el mensaje
 * del vendedor. Usa buildProductSearchWhere del productController.
 * Devuelve texto acotado a RAG_CHAR_CAP (5000 chars). Sin caché.
 */
export const buildRAGContext = async (
  message: string,
  organizationId?: string,
): Promise<string> => {
  if (!message || message.trim().length === 0) return "";

  const where = buildProductSearchWhere(message);

  const products = await prisma.product.findMany({
    where,
    select: {
      name: true,
      price: true,
      quantity: true,
      description: true,
      category: { select: { name: true } },
    },
    take: 50,
  });

  if (products.length === 0) return "";

  const lines = products.map((p) => {
    const cat = p.category?.name ?? "Sin categoría";
    return `• ${p.name} | Precio: $${p.price} | Stock: ${p.quantity} | Cat: ${cat}${p.description ? ` | Info: ${p.description}` : ""}`;
  });

  const context = `Productos relevantes para la consulta del vendedor:\n${lines.join("\n")}`;

  return context.length > RAG_CHAR_CAP
    ? context.slice(0, RAG_CHAR_CAP)
    : context;
};

export default {
  createVendorChat,
  listVendorChats,
  getVendorChatById,
  closeVendorChat,
  sendVendorMessage,
  buildRAGContext,
};

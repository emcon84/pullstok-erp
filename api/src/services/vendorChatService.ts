import { prisma } from "../config/db";
import { requireOrganizationId } from "../config/tenantContext";

// Cap de caracteres para el contexto RAG inyectado al bot (spec R3).
const RAG_CHAR_CAP = 5000;

// Palabras de relleno de una pregunta en lenguaje natural ("¿qué tenemos de
// royal canin para perro adulto?"). buildProductSearchWhere (usado por el
// buscador real del catálogo) exige que TODAS las palabras matcheen (AND) en
// un mismo producto — perfecto para "royal canin" tipeado a mano, pero
// "que"/"tenemos"/"de"/"para" nunca van a estar en el nombre de un producto,
// así que el AND siempre daba 0 resultados acá. Por eso el RAG usa su propio
// filtro + búsqueda OR: relevancia amplia para inyectar contexto, no
// precisión de buscador.
const RAG_STOPWORDS = new Set([
  "que", "tenemos", "tenes", "tienes", "tiene", "tienen", "de", "del", "la",
  "el", "los", "las", "para", "por", "con", "sin", "hay", "algo", "alguna",
  "alguno", "algun", "quiero", "necesito", "necesitas", "me", "mi", "dame",
  "dar", "sirve", "sirven", "un", "una", "unos", "unas", "y", "o", "a", "en",
  "es", "son", "como", "cual", "cuales", "cuanto", "cuanta", "cuestan",
  "cuesta", "precio", "precios", "stock", "hola", "porfa", "porfavor",
  "favor", "gracias", "buenas", "buen", "dia", "tarde", "noche",
]);

const normalizeRagToken = (value: string): string =>
  value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Extrae palabras con contenido (>=3 letras, sin stopwords) de una pregunta libre. */
const extractRagKeywords = (message: string): string[] => {
  const cleaned = normalizeRagToken(message).replace(/[^a-z0-9\s]/g, " ");
  const tokens = cleaned.split(/\s+/).filter((w) => w.length >= 3 && !RAG_STOPWORDS.has(w));
  return Array.from(new Set(tokens));
};

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

export const deleteVendorChat = async (id: string) => {
  return prisma.vendorChat.delete({ where: { id } });
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
 * del vendedor. Extrae keywords (sin stopwords) de la pregunta libre y
 * busca por OR — el vendedor tipea preguntas, no keywords de buscador.
 * Devuelve texto acotado a RAG_CHAR_CAP (5000 chars). Sin caché.
 */
export const buildRAGContext = async (
  message: string,
  organizationId?: string,
): Promise<string> => {
  if (!message || message.trim().length === 0) return "";

  const keywords = extractRagKeywords(message);
  if (keywords.length === 0) return "";

  const where = {
    OR: keywords.flatMap((w) => [
      { name: { contains: w, mode: "insensitive" as const } },
      { code: { contains: w, mode: "insensitive" as const } },
      { description: { contains: w, mode: "insensitive" as const } },
      { category: { name: { contains: w, mode: "insensitive" as const } } },
    ]),
  };

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
  deleteVendorChat,
  sendVendorMessage,
  buildRAGContext,
};

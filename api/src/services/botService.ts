import { BotConfig, Message, Organization } from "@prisma/client";
import { prisma, basePrisma } from "../config/db";
import { runWithTenant } from "../config/tenantContext";
import { persistMessage, escalateConversation } from "./chatService";
import { emitChatTyping } from "../realtime/socket";
import getNextSequenceValue from "./secuenceService";
import * as vendorChatService from "./vendorChatService";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const HISTORY_LIMIT = 15;
const KB_CHAR_CAP = 6000;
const MAX_TOKENS = 500;
const TIMEOUT_MS = 15000;

const BOT_PLAN = "PREMIUM";

let warnedNoKey = false;

export const resolveGroqKey = (botConfig: BotConfig): string | null =>
  botConfig.apiKey ?? process.env.GROQ_API_KEY ?? null;

const botCounterName = (): string =>
  `bot:${new Date().toISOString().slice(0, 10)}`;

const vendorChatCounterName = (): string =>
  `vendor-chat:${new Date().toISOString().slice(0, 10)}`;

const getBotUsageToday = async (organizationId: string): Promise<number> => {
  const counter = await basePrisma.counter.findFirst({
    where: { organizationId, name: botCounterName() },
    select: { sequenceValue: true },
  });
  return counter?.sequenceValue ?? 0;
};

export const getVendorChatUsageToday = async (
  organizationId: string,
): Promise<number> => {
  const counter = await basePrisma.counter.findFirst({
    where: { organizationId, name: vendorChatCounterName() },
    select: { sequenceValue: true },
  });
  return counter?.sequenceValue ?? 0;
};

const incrementBotUsage = (organizationId: string): Promise<number> =>
  getNextSequenceValue(organizationId, botCounterName());

export const incrementVendorChatUsage = (
  organizationId: string,
): Promise<number> =>
  getNextSequenceValue(organizationId, vendorChatCounterName());

type GroqRole = "system" | "user" | "assistant";
interface GroqMessage {
  role: GroqRole;
  content: string;
}

const HANDOFF_TOOL = {
  type: "function",
  function: {
    name: "request_human_handoff",
    description:
      "Llamar ÚNICAMENTE cuando el usuario pide EXPLÍCITAMENTE hablar con una persona, un humano, un asesor o un representante. NO llamar para consultas normales que se pueden responder con la base de conocimiento.",
    parameters: { type: "object", properties: {} },
  },
} as const;

export type BotReply = { kind: "text"; content: string } | { kind: "handoff" };

interface GroqChoiceMessage {
  content?: string | null;
  tool_calls?: { function?: { name?: string } }[];
}

const stripFunctionTags = (text: string): string =>
  text
    .replace(/<function[^>]*>[\s\S]*?<\/function>/gi, "")
    .replace(/<function[^>]*>\s*\{[\s\S]*?\}/gi, "")
    .replace(/<\/?function[^>]*>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const buildSystemPrompt = (org: Organization, botConfig: BotConfig): string => {
  const kb = botConfig.knowledgeBase.trim().slice(0, KB_CHAR_CAP);
  const knowledge =
    kb.length > 0
      ? kb
      : "(El comercio todavía no cargó información. No tenés datos para responder consultas puntuales.)";

  return [
    `Sos el asistente de atención al cliente de "${org.name}".`,
    "Respondé SIEMPRE en español rioplatense, con tono cordial y cercano pero profesional.",
    "Usá EXCLUSIVAMENTE la información de la BASE DE CONOCIMIENTO de abajo para responder.",
    "Tu tarea es RESPONDER las consultas del cliente con la base de conocimiento. Derivá a un humano (llamando a request_human_handoff) SOLO si el cliente pide explícitamente hablar con una persona, un humano o un asesor. Para cualquier otra consulta, respondé con texto.",
    "NO inventes datos (precios, stock, horarios, envíos, políticas) que no estén en la base de conocimiento. Si te falta un dato puntual, decilo con amabilidad y comentá que puede pedir hablar con una persona si lo necesita — pero NO derives por tu cuenta, solo si el cliente lo pide.",
    "Sé breve y claro: respuestas cortas, sin relleno.",
    "",
    "--- BASE DE CONOCIMIENTO ---",
    knowledge,
    "--- FIN BASE DE CONOCIMIENTO ---",
  ].join("\n");
};

export const buildVendorSystemPrompt = (
  org: Organization,
  ragContext?: string,
): string => {
  const parts = [
    `Sos el asistente de ventas del vendedor en "${org.name}".`,
    "Respondé SIEMPRE en español rioplatense, con tono profesional y orientado a cerrar ventas.",
    "Tu tarea es AYUDAR AL VENDEDOR a responder consultas de productos del catálogo de la org. Enfocate en PRECIO, STOCK, CARACTERÍSTICAS y RECOMENDACIONES de venta.",
    "Usá EXCLUSIVAMENTE la información de los PRODUCTOS inyectada abajo y la del catálogo de la org. NO inventes datos.",
    "NO ofrezcas derivar a un humano: vos sos el asistente del vendedor, respondé con información de productos y sugerencias de venta.",
    "Sé breve y directo: respuestas cortas, enfocadas en vender.",
    "FORMATO: esto se muestra en una burbuja de chat angosta, NO en un documento. NUNCA uses tablas Markdown (con | y guiones) ni encabezados (#). Evitá **negrita** salvo un nombre de producto puntual. Si listás varios productos, uno por línea con un guión \"-\", formato: \"- Nombre — $precio (stock: N)\". Si es uno solo, respondé en prosa corta, sin lista.",
  ];

  if (ragContext && ragContext.length > 0) {
    parts.push("", "--- PRODUCTOS RELEVANTES ---", ragContext, "--- FIN PRODUCTOS ---");
  }

  return parts.join("\n");
};

const mapHistory = (messages: Message[]): GroqMessage[] =>
  messages.slice(-HISTORY_LIMIT).map((m) => ({
    role: m.sender === "GUEST" ? "user" : "assistant",
    content: m.body,
  }));

export const generateBotReply = async ({
  botConfig,
  org,
  messages,
  ragContext,
  vendorMode,
}: {
  botConfig: BotConfig;
  org: Organization;
  messages: Message[];
  ragContext?: string;
  vendorMode?: boolean;
}): Promise<BotReply | null> => {
  const apiKey = resolveGroqKey(botConfig);
  if (!apiKey) {
    if (!warnedNoKey) {
      warnedNoKey = true;
      console.warn(
        "[botService] GROQ_API_KEY no configurada — el bot no responde. " +
          "Definí GROQ_API_KEY en el env para habilitarlo.",
      );
    }
    return null;
  }

  const systemPrompt = vendorMode
    ? buildVendorSystemPrompt(org, ragContext)
    : buildSystemPrompt(org, botConfig);

  const chatMessages = [
    { role: "system", content: systemPrompt },
    ...mapHistory(messages),
  ] as GroqMessage[];

  const tools = vendorMode ? [] : [HANDOFF_TOOL];

  const callGroq = (withTools: boolean): Promise<Response> =>
    fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: botConfig.model,
        max_tokens: MAX_TOKENS,
        temperature: 0.4,
        messages: chatMessages,
        ...(withTools && tools.length > 0
          ? { tools, tool_choice: "auto" }
          : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

  try {
    let res = await callGroq(tools.length > 0);

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(
        `[botService] Groq respondió ${res.status} (con tools): ${detail.slice(0, 300)} — reintento sin tools`,
      );
      res = await callGroq(false);
      if (!res.ok) {
        const detail2 = await res.text().catch(() => "");
        console.error(
          `[botService] Groq respondió ${res.status} (sin tools): ${detail2.slice(0, 300)}`,
        );
        return null;
      }
    }

    const data = (await res.json()) as {
      choices?: { message?: GroqChoiceMessage }[];
    };
    const message = data.choices?.[0]?.message;

    const rawContent = message?.content ?? "";
    const toolHandoff = (message?.tool_calls ?? []).some(
      (t) => t.function?.name === "request_human_handoff",
    );
    const inlineHandoff = /request_human_handoff/i.test(rawContent);
    if (vendorMode && (toolHandoff || inlineHandoff)) {
      return { kind: "text", content: stripFunctionTags(rawContent) };
    }
    if (toolHandoff || inlineHandoff) return { kind: "handoff" };

    const content = stripFunctionTags(rawContent);
    return content.length > 0 ? { kind: "text", content } : null;
  } catch (err) {
    console.error("[botService] fallo llamando a Groq (bot en silencio)", err);
    return null;
  }
};

export const replyToVendorChat = async ({
  vendorChatId,
}: {
  vendorChatId: string;
}): Promise<void> => {
  const vendorChat = await prisma.vendorChat.findFirst({
    where: { id: vendorChatId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!vendorChat || vendorChat.status !== "ACTIVE") {
    console.warn(
      "[vendorChat] bot no respondió: conversación no encontrada o no ACTIVE",
      { vendorChatId },
    );
    return;
  }

  const messages = vendorChat.messages ?? [];

  const lastSellerMsg = [...messages]
    .reverse()
    .find((m) => m.sender === "SELLER");
  if (!lastSellerMsg) {
    console.warn("[vendorChat] bot no respondió: sin mensaje de vendedor", {
      vendorChatId,
    });
    return;
  }

  const ragContext = await vendorChatService.buildRAGContext(
    lastSellerMsg.body,
    vendorChat.organizationId,
  );

  const botConfig = await prisma.botConfig.findFirst();
  if (!botConfig || !botConfig.enabled) {
    console.warn("[vendorChat] bot no respondió: botConfig deshabilitado", {
      vendorChatId,
    });
    return;
  }

  const apiKey = resolveGroqKey(botConfig);
  if (!apiKey) {
    console.warn("[vendorChat] bot no respondió: sin Groq API key", {
      vendorChatId,
    });
    return;
  }

  const org = await basePrisma.organization.findFirst({
    where: { id: vendorChat.organizationId },
  });
  if (!org) {
    console.warn("[vendorChat] bot no respondió: organización no encontrada", {
      vendorChatId,
    });
    return;
  }

  const history = messages.slice(-HISTORY_LIMIT).map((m) => ({
    role: (m.sender === "SELLER" ? "user" : "assistant") as "user" | "assistant",
    content: m.body,
  }));

  const systemPrompt = buildVendorSystemPrompt(org, ragContext);

  const chatMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemPrompt },
    ...history,
  ];

  let res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: botConfig.model,
      max_tokens: MAX_TOKENS,
      temperature: 0.4,
      messages: chatMessages,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: botConfig.model,
        max_tokens: MAX_TOKENS,
        temperature: 0.4,
        messages: chatMessages,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(
        "[vendorChat] bot no respondió: Groq devolvió error tras reintento",
        { vendorChatId, status: res.status },
      );
      return;
    }
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string | null } }[];
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  if (!content?.trim()) {
    console.warn("[vendorChat] bot no respondió: respuesta vacía de Groq", {
      vendorChatId,
    });
    return;
  }

  await vendorChatService.sendVendorMessage({
    vendorChatId,
    organizationId: vendorChat.organizationId,
    sender: "ASSISTANT",
    body: content,
  });
};

const handleBotReply = async (
  conversationId: string,
  organizationId: string,
): Promise<void> => {
  const botConfig = await prisma.botConfig.findFirst();
  if (!botConfig || !botConfig.enabled) return;

  const org = await basePrisma.organization.findFirst({
    where: { id: organizationId },
  });
  if (!org || org.plan !== BOT_PLAN) return;

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId },
  });
  if (
    !conversation ||
    conversation.status !== "OPEN" ||
    conversation.mode !== "BOT"
  ) {
    return;
  }

  const history = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take: HISTORY_LIMIT + 5,
  });
  if (history.length === 0) return;

  const last = history[history.length - 1];
  if (last.sender !== "GUEST") return;

  const usedToday = await getBotUsageToday(organizationId);
  if (usedToday >= botConfig.dailyLimit) {
    console.warn(
      `[botService] límite diario alcanzado (org=${organizationId}, ${usedToday}/${botConfig.dailyLimit}) — bot en silencio`,
    );
    return;
  }

  emitChatTyping(conversationId, "OPERATOR", true);
  try {
    const reply = await generateBotReply({ botConfig, org, messages: history });
    if (!reply) return;

    if (reply.kind === "handoff") {
      await escalateConversation(conversationId, organizationId);
      return;
    }

    await persistMessage({
      conversationId,
      sender: "OPERATOR",
      senderUserId: null,
      isBot: true,
      body: reply.content,
    });

    await incrementBotUsage(organizationId);
  } finally {
    emitChatTyping(conversationId, "OPERATOR", false);
  }
};

export const maybeReplyToGuestMessage = ({
  conversationId,
  organizationId,
}: {
  conversationId: string;
  organizationId: string;
}): void => {
  void runWithTenant(
    { userId: "bot", role: "EMPLOYEE", organizationId },
    async () => {
      try {
        await handleBotReply(conversationId, organizationId);
      } catch (err) {
        console.error("[botService] fallo en el disparo del bot", err);
      }
    },
  );
};

export default {
  maybeReplyToGuestMessage,
  generateBotReply,
  resolveGroqKey,
  getVendorChatUsageToday,
  incrementVendorChatUsage,
  replyToVendorChat,
};

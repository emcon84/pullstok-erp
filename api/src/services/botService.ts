import { BotConfig, Message, Organization } from "@prisma/client";
import { prisma, basePrisma } from "../config/db";
import { runWithTenant } from "../config/tenantContext";
// Import UNIDIRECCIONAL (botService → chatService/realtime): estos módulos NO
// importan botService → sin ciclo. persistMessage es el ÚNICO punto de escritura
// de mensajes (emite chat:message al room); emitChatTyping muestra el
// "escribiendo…" del lado OPERATOR mientras Groq genera.
import { persistMessage, escalateConversation } from "./chatService";
import { emitChatTyping } from "../realtime/socket";
import getNextSequenceValue from "./secuenceService";

/**
 * Bot de atención IA (FASE 1: motor Groq).
 *
 * El bot es un "operador" que responde con Groq en vez de un humano. Su respuesta
 * fluye por la MISMA infra de chat existente: se persiste con persistMessage
 * (sender=OPERATOR, senderUserId=null, isBot=true) → eso emite chat:message al
 * room de la conversación, igual que la respuesta de un humano.
 *
 * Se dispara FIRE-AND-FORGET después de que un GUEST manda un mensaje (ver
 * chatController.postGuestMessage): nunca bloquea el response REST del visitante.
 *
 * FASE 2 (fuera de alcance): handoff a humano (flipear Conversation.mode a HUMAN),
 * config del bot desde el ERP, BYO-key encriptada.
 */

// Endpoint compatible con OpenAI que expone Groq. Usamos plain fetch (Node 20
// trae fetch + AbortSignal.timeout globales) para no sumar una dependencia.
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// Caps de contexto/costo. Truncamos SIEMPRE: nunca mandamos una conversación
// infinita ni una base de conocimiento gigante a Groq.
const HISTORY_LIMIT = 15; // últimos N mensajes que se mandan como historial
const KB_CHAR_CAP = 6000; // máx. de caracteres de la base de conocimiento
const MAX_TOKENS = 500; // tope de tokens de la respuesta del bot
const TIMEOUT_MS = 15000; // timeout del fetch a Groq (red / rate limit colgado)

// El bot solo atiende a comercios PREMIUM (gating por plan). Mismo criterio que
// checkStoreEnabled pero más restrictivo (STORE es PRO+; el bot es PREMIUM).
const BOT_PLAN = "PREMIUM";

// warn-once (mismo espíritu que mailService): si falta GROQ_API_KEY, avisamos una
// sola vez y el bot queda en silencio (no rompe nada).
let warnedNoKey = false;

/**
 * Resuelve la key de Groq a usar. ENCHUFABLE: hoy SIEMPRE cae en la key de
 * plataforma (env GROQ_API_KEY). El `botConfig.apiKey` es un placeholder para el
 * futuro BYO-key (bring-your-own-key) del comercio; cuando se implemente habrá
 * que ENCRIPTAR esa columna. Devuelve null si no hay ninguna key configurada.
 */
export const resolveGroqKey = (botConfig: BotConfig): string | null =>
  botConfig.apiKey ?? process.env.GROQ_API_KEY ?? null;

// Nombre del contador diario de uso del bot, por org (reusa el modelo Counter,
// mismo patrón que la numeración de comprobantes). Un contador por día (UTC).
const botCounterName = (): string =>
  `bot:${new Date().toISOString().slice(0, 10)}`;

/**
 * Uso del bot en el día de hoy para una org (0 si nunca respondió hoy). Counter
 * NO es tenant-model (se scopea a mano por organizationId + name), así que se lee
 * con basePrisma con el where explícito.
 */
const getBotUsageToday = async (organizationId: string): Promise<number> => {
  const counter = await basePrisma.counter.findFirst({
    where: { organizationId, name: botCounterName() },
    select: { sequenceValue: true },
  });
  return counter?.sequenceValue ?? 0;
};

// Suma 1 al contador diario del bot (upsert atómico, reusa secuenceService).
const incrementBotUsage = (organizationId: string): Promise<number> =>
  getNextSequenceValue(organizationId, botCounterName());

// ---------------------------------------------------------------------------
// Armado del prompt y llamada a Groq
// ---------------------------------------------------------------------------

type GroqRole = "system" | "user" | "assistant";
interface GroqMessage {
  role: GroqRole;
  content: string;
}

// Tool (function calling, formato OpenAI que Groq acepta) para el handoff a
// humano de FASE 2. Sin parámetros: es una señal ("derivá a un humano"), la
// decisión de cuándo llamarlo la toma el modelo según el system prompt.
const HANDOFF_TOOL = {
  type: "function",
  function: {
    name: "request_human_handoff",
    description:
      "Llamar ÚNICAMENTE cuando el usuario pide EXPLÍCITAMENTE hablar con una persona, un humano, un asesor o un representante. NO llamar para consultas normales que se pueden responder con la base de conocimiento.",
    parameters: { type: "object", properties: {} },
  },
} as const;

// Resultado del bot: o una respuesta de texto normal, o la señal de handoff
// (el modelo llamó a request_human_handoff → hay que escalar, no persistir texto).
// null se reserva para "el bot no responde" (sin key, error, respuesta vacía).
export type BotReply = { kind: "text"; content: string } | { kind: "handoff" };

// Shape parcial del `message` que devuelve Groq en cada choice (solo lo que
// consumimos: texto y/o tool_calls).
interface GroqChoiceMessage {
  content?: string | null;
  tool_calls?: { function?: { name?: string } }[];
}

// System prompt: define al bot como asistente del comercio, en español
// rioplatense, y lo ata a responder SOLO con la base de conocimiento (si no sabe,
// lo dice y ofrece derivar a un humano). Dejado listo para extenderse en FASE 2
// (p.ej. instrucciones de handoff explícito).
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

// Mapea los últimos mensajes del historial a roles de Groq: GUEST → user,
// OPERATOR (humano o bot) → assistant. Trunca a HISTORY_LIMIT.
const mapHistory = (messages: Message[]): GroqMessage[] =>
  messages.slice(-HISTORY_LIMIT).map((m) => ({
    role: m.sender === "GUEST" ? "user" : "assistant",
    content: m.body,
  }));

/**
 * Llama a Groq y devuelve el texto de la respuesta del bot, o null si algo falla.
 * ROBUSTO: cualquier error (red, timeout, rate limit, key inválida, respuesta
 * rara) se loguea y devuelve null → el bot queda en silencio, nunca rompe el
 * flujo del chat.
 */
export const generateBotReply = async ({
  botConfig,
  org,
  messages,
}: {
  botConfig: BotConfig;
  org: Organization;
  messages: Message[];
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

  const chatMessages = [
    { role: "system", content: buildSystemPrompt(org, botConfig) },
    ...mapHistory(messages),
  ] as GroqMessage[];

  // Un solo POST a Groq. `withTools` decide si mandamos el tool de handoff:
  // permite reintentar SIN tools si el modelo elegido no los soporta.
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
        ...(withTools
          ? { tools: [HANDOFF_TOOL], tool_choice: "auto" }
          : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

  try {
    let res = await callGroq(true);

    // Degradación con gracia: si el modelo no soporta tools (o Groq rechaza el
    // request con tools por cualquier motivo), reintentamos UNA vez sin tools
    // para al menos dar una respuesta de texto normal en vez de quedar mudos.
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

    // Handoff tiene PRIORIDAD sobre el texto: si el modelo llamó al tool (aun si
    // además devolvió algo de texto), escalamos y descartamos ese texto.
    const wantsHandoff = (message?.tool_calls ?? []).some(
      (t) => t.function?.name === "request_human_handoff",
    );
    if (wantsHandoff) return { kind: "handoff" };

    const content = message?.content?.trim();
    return content && content.length > 0 ? { kind: "text", content } : null;
  } catch (err) {
    console.error("[botService] fallo llamando a Groq (bot en silencio)", err);
    return null;
  }
};

// ---------------------------------------------------------------------------
// Orquestador: disparo del bot tras un mensaje del GUEST
// ---------------------------------------------------------------------------

/**
 * Trabajo real del bot para una conversación. Corre DENTRO de runWithTenant (lo
 * abre maybeReplyToGuestMessage) → persistMessage y el `prisma` scopeado tienen
 * contexto de org aunque el request HTTP del guest ya haya terminado.
 */
const handleBotReply = async (
  conversationId: string,
  organizationId: string,
): Promise<void> => {
  // Config del bot (tenant-model → findFirst scopeado). Sin config o deshabilitado
  // → el bot no existe para esta org.
  const botConfig = await prisma.botConfig.findFirst();
  if (!botConfig || !botConfig.enabled) return;

  // Gating por plan: solo PREMIUM. Organization NO es tenant-model → basePrisma
  // con where explícito.
  const org = await basePrisma.organization.findFirst({
    where: { id: organizationId },
  });
  if (!org || org.plan !== BOT_PLAN) return;

  // La conversación debe existir, estar OPEN y en modo BOT (en FASE 2 el handoff
  // la pasa a HUMAN → el bot se calla). Conversation es tenant-model → findFirst
  // scopeado (ownership implícito por org).
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

  // Historial (Message NO es tenant-model → no necesita scope; se acota por el
  // conversationId ya validado como de la org).
  const history = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take: HISTORY_LIMIT + 5, // pequeño margen antes del slice final
  });
  if (history.length === 0) return;

  // Guarda anti-loop: el bot SOLO responde si el último mensaje es del GUEST.
  // Sus propias respuestas nacen como OPERATOR → nunca se auto-responde.
  const last = history[history.length - 1];
  if (last.sender !== "GUEST") return;

  // Freno de costo: si ya se alcanzó el tope diario, el bot queda en silencio.
  const usedToday = await getBotUsageToday(organizationId);
  if (usedToday >= botConfig.dailyLimit) {
    console.warn(
      `[botService] límite diario alcanzado (org=${organizationId}, ${usedToday}/${botConfig.dailyLimit}) — bot en silencio`,
    );
    return;
  }

  // "escribiendo…" del lado OPERATOR mientras Groq genera. Se corta SIEMPRE en el
  // finally (haya respuesta o no).
  emitChatTyping(conversationId, "OPERATOR", true);
  try {
    const reply = await generateBotReply({ botConfig, org, messages: history });
    if (!reply) return; // Groq falló o no hay key → nada que mandar

    // FASE 2 — HANDOFF: el modelo llamó a request_human_handoff. En vez de
    // responder texto, escalamos la conversación a HUMAN (el bot se calla, se
    // avisa a los operadores). No contamos uso: no hubo respuesta de conocimiento.
    if (reply.kind === "handoff") {
      await escalateConversation(conversationId, organizationId);
      return;
    }

    // Persiste como respuesta del bot: sender=OPERATOR (fluye igual que un
    // humano), senderUserId=null, isBot=true. persistMessage emite chat:message.
    await persistMessage({
      conversationId,
      sender: "OPERATOR",
      senderUserId: null,
      isBot: true,
      body: reply.content,
    });

    // Recién acá contamos el uso: el contador refleja respuestas REALMENTE
    // generadas (no intentos que fallaron).
    await incrementBotUsage(organizationId);
  } finally {
    emitChatTyping(conversationId, "OPERATOR", false);
  }
};

/**
 * Punto de entrada FIRE-AND-FORGET del bot. Lo llama chatController.postGuestMessage
 * DESPUÉS de persistir el mensaje del guest y responder el HTTP. NUNCA se espera
 * (`void`): la respuesta del visitante no debe bloquearse por Groq.
 *
 * Abre su propio contexto de tenant (runWithTenant) con el organizationId de la
 * conversación → no depende de que sobreviva el AsyncLocalStorage del request.
 * Todo el trabajo va envuelto en try/catch: un fallo del bot jamás propaga.
 */
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

export default { maybeReplyToGuestMessage, generateBotReply, resolveGroqKey };

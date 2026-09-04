import { createHmac, timingSafeEqual } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma, basePrisma } from "../config/db";
import { runWithTenant, requireOrganizationId } from "../config/tenantContext";
import { persistMessage, escalateConversation } from "./chatService";
import {
  planResponse,
  nextStageForAnswer,
  buildDraftData,
  mergeDraftData,
  isHandoffStage,
  isTerminalStage,
  isRestartIntent,
  STAGE_SPECIES,
  STAGE_TYPED,
  STAGE_BRAND,
  STAGE_PRODUCT_SELECT,
  STAGE_PRODUCT_QUANTITY,
  STAGE_PRODUCT_AMOUNT,
  STAGE_SIZE,
  STAGE_NOTES,
  type FlowCatalog,
} from "./whatsappFlow";
import {
  listSpecies,
  listStages,
  matchStages,
  listBrands,
  matchBrands,
  listProductsForSelection,
  calculateOrderCost,
  buildCatalogSlug,
  searchCatalog,
  findPrice,
  normalizeSpeciesAnswer,
  parseDecimal,
  matchProductForDraft,
  brandNameById,
  stageNameById,
  formatMoney,
  SPECIES_LABELS,
} from "./whatsappCatalog";

/**
 * Servicio de dominio de WhatsApp Business vía Kapso (FASE 1).
 *
 * Sin lógica Express: acá vive la firma HMAC, la normalización de phone y la
 * persistencia de la conversación/mensaje entrante. El controller (HTTP) solo
 * orquesta; las funciones de salida (sendText / sendInteractiveButtons) quedan
 * implementadas y listas para la FASE 2 (auto-reply con botones).
 *
 * Kapso firma el body EXACTO con HMAC-SHA256 (hex). Por eso el webhook se
 * verifica contra el buffer crudo (req.rawBody) y NO contra el JSON.parseado:
 * `JSON.stringify` de los bytes parseados no es idéntico al cuerpo original.
 */

// ---------------------------------------------------------------------------
// Asesoramiento Groq (FASE 4): consulta de productos con tools y datos REALES.
// Reutiliza el endpoint/config de botService (Groq, fetch nativo, caps) pero con
// tools propias (get_product_info / get_price) que consultan el catálogo de la DB
// → Groq SIEMPRE responde con datos reales, nunca inventa precios ni composición.
// ---------------------------------------------------------------------------

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.1-8b-instant";
const GROQ_MAX_TOKENS = 500;
const GROQ_TIMEOUT_MS = 15000;
const GROQ_HISTORY_LIMIT = 8;
const CATALOG_SLUG_CAP = 4500;

// Tools (function calling, formato OpenAI que Groq acepta) para el asesoramiento
// con datos reales del catálogo. El modelo las llama y nosotros ejecutamos la
// consulta REAL a la DB, devolviéndole el resultado para que arme la respuesta.
const GET_PRODUCT_INFO_TOOL = {
  type: "function",
  function: {
    name: "get_product_info",
    description:
      "Buscar información real de un producto del catálogo: nombre, categoría, marca, etapa, especie y precio (bolsa y por kg). Llamar cuando el cliente pregunta por un producto específico o quiere conocer su detalle.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Nombre, marca o texto del producto que busca el cliente.",
        },
      },
      required: ["query"],
    },
  },
} as const;

const GET_PRICE_TOOL = {
  type: "function",
  function: {
    name: "get_price",
    description:
      "Consultar el precio REAL de un producto (bolsa y/o por kg) del catálogo. Llamar para dar un precio exacto de lo que pregunta el cliente.",
    parameters: {
      type: "object",
      properties: {
        product: {
          type: "string",
          description: "Nombre o marca del producto cuyo precio quiere el cliente.",
        },
      },
      required: ["product"],
    },
  },
} as const;

const CATALOG_TOOLS = [GET_PRODUCT_INFO_TOOL, GET_PRICE_TOOL] as const;

/** Quita etiquetas `<function ...>` que algunos modelos filtran como texto. */
const stripFunctionTags = (text: string): string =>
  text
    .replace(/<function[^>]*>[\s\S]*?<\/function>/gi, "")
    .replace(/<function[^>]*>\s*\{[\s\S]*?\}/gi, "")
    .replace(/<\/?function[^>]*>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/**
 * ¿El mensaje del cliente parece una CONSULTA sobre un producto? Si es así, el
 * flujo rígido de nodos se corta y Groq asesora con tools (datos reales). Los
 * ids de botones (especies/etapas/productos) NO matchean estos patrones, así que
 * el flujo guiado sigue intacto cuando el cliente elige opciones.
 */
export const isCatalogQuery = (message: string): boolean => {
  const m = (message ?? "").toLowerCase();
  return (
    m.includes("para qué sirve") ||
    m.includes("qué es") ||
    m.includes("que es") ||
    m.includes("qué me recomendas") ||
    m.includes("recomend") ||
    m.includes("ayudame a elegir") ||
    m.includes("ayudame") ||
    m.includes("sirve para") ||
    m.includes("cuánto sale") ||
    m.includes("cuanto sale") ||
    m.includes("es bueno") ||
    m.includes("porque es")
  );
};

interface GroqMsg {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
}

// Ejecuta una tool real contra el catálogo (get_product_info / get_price).
const runCatalogTool = async (
  name: string,
  args: Record<string, unknown>,
): Promise<string> => {
  const query =
    String(args?.query ?? args?.product ?? "").trim() || "alimento";
  if (name === "get_price") return findPrice(query);
  return searchCatalog(query);
};

// Llamada única a Groq con tools (o sin tools para el segundo round del loop).
const callGroq = async (
  apiKey: string,
  messages: GroqMsg[],
  withTools: boolean,
): Promise<Response> =>
  fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      max_tokens: GROQ_MAX_TOKENS,
      temperature: 0.4,
      messages,
      ...(withTools ? { tools: CATALOG_TOOLS, tool_choice: "auto" } : {}),
    }),
    signal: AbortSignal.timeout(GROQ_TIMEOUT_MS),
  });

/**
 * Asesora al cliente con Groq + tools sobre el catálogo REAL: carga un slug del
 * catálogo (nombre/categoría/marca/etapa/especie/precio) en el system prompt y le
 * exige NO inventar datos. Si el modelo llama a get_product_info/get_price,
 * ejecutamos la consulta real y alimentamos la respuesta. Luego se envía por
 * WhatsApp y se persiste como mensaje del bot.
 *
 * Corre DENTRO del runWithTenant del webhook → prisma scoped (org real).
 */
const answerCatalogAdvice = async (input: {
  conversationId: string;
  phone: string;
  answer: string;
}): Promise<void> => {
  const { conversationId, phone, answer } = input;
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.warn("[whatsapp] GROQ_API_KEY no configurada — sin asesoramiento");
    return;
  }

  const slug = await buildCatalogSlug(CATALOG_SLUG_CAP).catch((err) => {
    console.error("[whatsapp] fallo al armar slug de catálogo", err);
    return "(No se pudieron cargar los productos)";
  });

  const system = [
    "Sos el asistente de venta de una pet shop. Asesorás al cliente sobre productos del catálogo.",
    "Respondé SIEMPRE en español rioplatense, cordial, breve y claro.",
    "Usá EXCLUSIVAMENTE los productos y precios que te paso abajo. NO inventes precios, marcas, etapas ni descripciones.",
    "Para precios exactos o detalles de un producto específico, usá las tools get_product_info y get_price en vez de adivinar.",
    "Si no tenés el dato (precio, stock, composición), decilo con honestidad y ofrecé que el cliente hable con una persona.",
    "NO prometas descuentos ni ofertas que no estén en los datos.",
    "",
    "--- CATÁLOGO REAL ---",
    slug,
    "--- FIN CATÁLOGO ---",
  ].join("\n");

  const history = await prisma.message
    .findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      take: GROQ_HISTORY_LIMIT + 2,
    })
    .catch(() => []);

  const messages: GroqMsg[] = [
    { role: "system", content: system },
    // Excluimos la última (el mensaje actual ya se persiste y se manda aparte
    // como user) para no duplicar el pedido en el historial de Groq.
    ...history
      .slice(0, -1)
      .filter((m: any) => m.sender === "GUEST")
      .slice(-GROQ_HISTORY_LIMIT)
      .map((m: any) => ({ role: "user" as const, content: m.body })),
    { role: "user", content: answer },
  ];

  try {
    let res = await callGroq(apiKey, messages, true);
    // Degradación con gracia: si el modelo no soporta tools, reintentamos sin.
    if (!res.ok) {
      console.warn(
        `[whatsapp] Groq respondió ${res.status} con tools — reintento sin tools`,
      );
      res = await callGroq(apiKey, messages, false);
    }
    if (!res.ok) return;

    const data = (await res.json()) as {
      choices?: {
        message?: {
          content?: string | null;
          tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[];
        };
      }[];
    };
    let msg = data.choices?.[0]?.message;

    // Tool loop: si el modelo llamó tools, ejecutamos las consultas reales y le
    // pedimos la respuesta final (segundo round, sin tools).
    const toolCalls = msg?.tool_calls ?? [];
    if (toolCalls.length > 0) {
      const enriched: GroqMsg[] = [...messages];
      for (const tc of toolCalls) {
        const name = tc.function?.name ?? "";
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function?.arguments ?? "{}");
        } catch {
          /* args mal formados → vacíos */
        }
        const result = await runCatalogTool(name, args);
        enriched.push({
          role: "tool",
          content: result,
          tool_call_id: tc.id ?? name,
          name,
        });
      }
      try {
        const finalRes = await callGroq(apiKey, enriched, false);
        if (finalRes.ok) {
          const finalData = (await finalRes.json()) as {
            choices?: { message?: { content?: string | null } }[];
          };
          msg = finalData.choices?.[0]?.message;
        }
      } catch {
        /* si el segundo round falla, usamos el texto del primero */
      }
    }

    const content = stripFunctionTags(msg?.content ?? "");
    if (content.length === 0) return;

    await sendText(phone, content);
    await persistMessage({
      conversationId,
      sender: "OPERATOR",
      senderUserId: null,
      isBot: true,
      body: content,
    });
  } catch (err) {
    console.error("[whatsapp] asesoramiento Groq falló", err);
  }
};

/** Verifica la firma HMAC-SHA256 (hex) de Kapso sobre el body crudo. */
export const verifyWebhookSignature = (
  rawBody: Buffer,
  signature: string | undefined,
  secret: string,
): boolean => {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const sig = Buffer.from(signature, "utf8");
  const exp = Buffer.from(expected, "utf8");
  // timingSafeEqual lanza RangeError con buffers de distinta longitud → chequeo
  // explícito para que una firma mal formada no rompa el webhook.
  if (sig.length !== exp.length) return false;
  return timingSafeEqual(sig, exp);
};

/**
 * Normaliza un teléfono a dígitos puros (quita espacios, "+", guiones y
 * paréntesis) como pide Kapso: E.164 sin espacios ni "+". Vacío → null.
 * Ej: "+56 9 2040 3095" -> "56920403095".
 */
export const normalizePhone = (
  raw: string | undefined | null,
): string | null => {
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, "");
  return digits.length > 0 ? digits : null;
};

/**
 * Resuelve el organizationId de la org por slug (KAPSO_ORG_SLUG). Usa
 * basePrisma porque Organization NO es tenant-model y acá no hay contexto de
 * tenant (es un webhook externo). Sin slug o sin org activa → null.
 */
export const resolveOrgIdBySlug = async (
  slug: string | undefined,
): Promise<string | null> => {
  if (!slug) return null;
  const org = await basePrisma.organization.findFirst({
    where: { slug, isActive: true },
    select: { id: true },
  });
  return org?.id ?? null;
};

/**
 * Reusa (o crea) la conversación WHATSAPP de un cliente. DEBE llamarse dentro de
 * un runWithTenant ya establecido (lo abre handleIncomingMessage) → el `prisma`
 * scopeado inyecta organizationId y hay ownership anti-fuga.
 *
 * Reusa la conversación OPEN del mismo número; si no, intenta linkear un
 * Customer por phone y crea una nueva. Conversation es tenant-model → findFirst
 * (nunca findUnique) y create están permitidos; create necesita organizationId
 * explícito para satisfacer los tipos de Prisma (la extensión igual lo inyecta).
 */
export const getOrCreateWhatsAppConversation = async (input: {
  phone: string;
  contactName?: string | null;
}) => {
  const { phone, contactName } = input;

  const existing = await prisma.conversation.findFirst({
    where: { channel: "WHATSAPP", guestPhone: phone, status: "OPEN" },
    orderBy: { lastMessageAt: "desc" },
  });
  if (existing) return existing;

  // Link opcional a Customer por phone (Customer es tenant-model → scoped).
  const customer = await prisma.customer.findFirst({
    where: { phone: { contains: phone } },
    select: { id: true },
  });

  // guestName/guestEmail son String NO nullable → sintéticos cuando falta dato.
  const conversation = await prisma.conversation.create({
    data: {
      organizationId: requireOrganizationId(),
      channel: "WHATSAPP",
      guestPhone: phone,
      guestName: contactName || `WhatsApp ${phone}`,
      guestEmail: `wa-${phone}@invitado.pullstok`,
      customerId: customer?.id ?? null,
      status: "OPEN",
    },
  });
  return conversation;
};

/**
 * Orquestador del mensaje entrante de Kapso. Extrae phone + texto/id de botón,
 * resuelve la org por slug y persiste la conversación/mensaje dentro de un
 * runWithTenant con el orgId de la org → persistMessage dispara todo el realtime
 * (chat:message y chat:conversation-updated).
 *
 * FASE 2: además de persistir, dispara el flujo guiado de pedido (máquina de
 * estados de whatsappFlow). La respuesta ya no es un simple texto: puede ser
 * texto, botones o una imagen QR. Todo el trabajo de envío va en try/catch para
 * que un fallo de Kapso nunca rompa la persistencia.
 */
export const handleIncomingMessage = async (payload: any): Promise<void> => {
  const phoneRaw =
    payload.conversation?.phone_number ?? payload.message?.from ?? null;
  const phone = normalizePhone(phoneRaw);
  if (!phone) {
    console.warn("[whatsapp] mensaje sin teléfono, se ignora");
    return;
  }

  const orgId = await resolveOrgIdBySlug(process.env.KAPSO_ORG_SLUG);
  if (!orgId) {
    console.warn("[whatsapp] KAPSO_ORG_SLUG sin org activa — mensaje ignorado");
    return;
  }

  // Unificamos la respuesta del cliente: si es un botón interactivo usamos su id
  // (button_reply.id o list_reply.id); si no, el texto libre. El flujo interpreta
  // tanto los ids (al hacer click en un botón) como el texto tipeado.
  const interactive = payload.message?.interactive;
  let body = "";
  if (interactive?.type === "button_reply") {
    body = interactive.button_reply?.id ?? "";
  } else if (interactive?.type === "list_reply") {
    body = interactive.list_reply?.id ?? "";
  } else {
    body =
      payload.message?.text?.body ??
      payload.message?.kapso?.content ??
      payload.kapso?.content ??
      "";
  }

  if (!body || body.trim().length === 0) {
    console.warn("[whatsapp] mensaje sin texto ni botón, se ignora");
    return;
  }

  const contactName =
    payload.conversation?.contact_name ??
    payload.conversation?.kapso?.contact_name ??
    null;

  await runWithTenant(
    { userId: "webhook", role: "EMPLOYEE", organizationId: orgId },
    async () => {
      const conv = await getOrCreateWhatsAppConversation({
        phone,
        contactName,
      });

      // El mensaje del cliente SIEMPRE se persiste: es la fuente del historial
      // que el operador va a leer cuando tome la conversación.
      await persistMessage({ conversationId: conv.id, sender: "GUEST", body });

      await applyFlowReply({
        conversationId: conv.id,
        phone,
        organizationId: orgId,
        currentStage: conv.whatsappStage ?? null,
        answer: body,
      });
    },
  );
};

// Acumulador JSON del borrador (FASE 3, extendido en FASE 4). El `any` es
// intencional: whatsappDraftData es un Json flexible y no hay un shape único.
type DraftData = Record<string, any>;

/**
 * Opciones (ids) de un nodo de menú para mapear una respuesta NUMÉRICA a un id.
 * Reutiliza las mismas consultas de catálogo → el número N apunta a la N-ésima
 * opción que el cliente vio en el texto/botones.
 */
const optionsForStage = async (
  stage: string,
  draft: DraftData,
): Promise<{ id: string }[]> => {
  if (stage === STAGE_TYPED) {
    // Si hay candidatas de etapa matcheadas por texto, el número 1..N mapea a esas.
    if (
      Array.isArray((draft as any).stageCandidates) &&
      (draft as any).stageCandidates.length > 0
    ) {
      return (draft as any).stageCandidates as { id: string }[];
    }
    return listStages(draft.selectedSpecies);
  }
  if (stage === STAGE_BRAND) {
    // Si hay candidatas matcheadas por texto, el número 1..N debe mapear a esas
    // (no a las 93 marcas). Si no, listamos las de la especie+etapa.
    if (
      Array.isArray((draft as any).brandCandidates) &&
      (draft as any).brandCandidates.length > 0
    ) {
      return (draft as any).brandCandidates as { id: string }[];
    }
    return listBrands(draft.selectedSpecies, draft.selectedStageId);
  }
  if (stage === STAGE_PRODUCT_SELECT) {
    return listProductsForSelection(
      draft.selectedSpecies,
      draft.selectedBrandId,
      draft.selectedStageId ?? null,
    );
  }
  return [];
};

/**
 * Captura la selección de la respuesta del cliente en los nodos de menú de FASE 4
 * y la devuelve como patch del borrador. Resuelve tanto el id de botón como el
 * número (1..N) contra el catálogo ya cargado (el flujo es puro y no sabe mapear
 * números → acá se resuelve contra la DB).
 */
const captureSelectionFor = async (
  currentStage: string,
  answer: string,
  draftBefore: DraftData,
): Promise<DraftData> => {
  const trimmed = (answer ?? "").trim();

  if (currentStage === STAGE_SPECIES) {
    const species = normalizeSpeciesAnswer(trimmed);
    return species ? { selectedSpecies: species } : {};
  }

  if (/^\d+$/.test(trimmed)) {
    const list = await optionsForStage(currentStage, draftBefore);
    const opt = list[parseInt(trimmed, 10) - 1];
    if (!opt) return {};
    if (currentStage === STAGE_TYPED) return { selectedStageId: opt.id };
    if (currentStage === STAGE_BRAND) return { selectedBrandId: opt.id };
  }

  // BRAND con TEXTO LIBRE: como hay muchas marcas (no se listan), el cliente
  // escribe el nombre y lo matcheamos con matchBrands (mismo motor de keywords
  // del matching planilla↔productos). Si el match es EXACTO (una sola marca)
  // avanzamos directo; si no, guardamos las candidatas para que confirme.
  if (currentStage === STAGE_BRAND && trimmed.length > 0) {
    const matches = await matchBrands(draftBefore.selectedSpecies, trimmed);
    if (matches.length === 1 && matches[0].exact) {
      return { selectedBrandId: matches[0].id };
    }
    if (matches.length > 0) {
      return {
        brandCandidates: matches.map((m) => ({ id: m.id, brand: m.brand })),
      };
    }
    // Sin match → pedimos que la escriba de nuevo (sin avanzar).
    return { brandNotFound: true };
  }

  // Id directo (botón interactivo). PRODUCT_SELECT además arma el objeto completo
  // (id + tipo + nombre + precio) para el cálculo de costo y la lectura del pedido.
  if (currentStage === STAGE_PRODUCT_SELECT) {
    const products = await listProductsForSelection(
      draftBefore.selectedSpecies,
      draftBefore.selectedBrandId,
      draftBefore.selectedStageId ?? null,
    );
    const prod =
      (/^\d+$/.test(trimmed)
        ? products[parseInt(trimmed, 10) - 1]
        : products.find((p) => p.id === trimmed)) ?? null;
    if (!prod) {
      // No se fijó un producto válido: el cliente puede haber escrito texto libre
      // ("1 bolsa de 15kg") en vez de elegir una opción. Señalamos que NO se pudo
      // fijar el producto para que el flujo NO avance a cantidad con un pedido
      // vacío (bug de pedido sin producto).
      return { productNotFound: true };
    }
    return {
      selectedProduct: {
        id: prod.id,
        type: prod.type,
        name: prod.label,
        price: prod.price,
      },
    };
  }

  if (currentStage === STAGE_TYPED && trimmed.length > 0) {
    // Etapa por TEXTO LIBRE ("Adulto", "Cachorro", "Kitten"): resuelve el id real
    // con matchStages (nombre/sinónimo). Si es exacta (una sola) avanza; si hay
    // varias candidatas se guardan para confirmar; si no hay, avisamos.
    const matches = await matchStages(draftBefore.selectedSpecies, trimmed);
    if (matches.length === 1 && matches[0].exact) {
      return { selectedStageId: matches[0].id };
    }
    if (matches.length > 0) {
      return {
        stageCandidates: matches.map((m) => ({ id: m.id, stage: m.stage })),
        brandTyped: undefined,
      };
    }
    return { stageNotFound: true };
  }
  if (currentStage === STAGE_BRAND && trimmed.length > 0) {
    return { selectedBrandId: trimmed };
  }
  return {};
};

/**
 * Resuelve el catálogo (especies/etapas/marcas/productos) para un nodo destino,
 * según la selección acumulada en el borrador. Lo que arma los botones/mensajes
 * del flujo puro.
 */
const catalogForStage = async (
  stage: string,
  draft: DraftData,
): Promise<FlowCatalog> => {
  switch (stage) {
    case STAGE_SPECIES:
      return { species: await listSpecies() };
    case STAGE_TYPED:
      return {
        stages:
          Array.isArray((draft as any).stageCandidates) &&
          (draft as any).stageCandidates.length > 0
            ? (draft as any).stageCandidates.map((c: { id: string; stage: string }) => ({
                id: c.id,
                stage: c.stage,
              }))
            : await listStages(draft.selectedSpecies),
      };
    case STAGE_BRAND:
      // Si hay candidatas matcheadas por texto (≤3) las mostramos para confirmar;
      // si no, listamos las marcas de la especie+etapa (o pedimos escribir si son
      // muchas — ver messageForStage). Evita el payload gigante con +90 marcas.
      return {
        brands: Array.isArray((draft as any).brandCandidates) &&
          (draft as any).brandCandidates.length > 0
          ? (draft as any).brandCandidates.map((c: { id: string; brand: string }) => ({
              id: c.id,
              brand: c.brand,
            }))
          : await listBrands(draft.selectedSpecies, draft.selectedStageId),
      };
    case STAGE_PRODUCT_SELECT:
      return {
        products: await listProductsForSelection(
          draft.selectedSpecies,
          draft.selectedBrandId,
          draft.selectedStageId ?? null,
        ),
      };
    default:
      return {};
  }
};

/** Calcula el costo del ítem al confirmar cantidad (bolsa/kilo) o importe (monto). */
const computeItemCost = async (
  currentStage: string,
  answer: string,
  draft: DraftData,
): Promise<{ total: number; detail: string } | null> => {
  if (currentStage !== STAGE_PRODUCT_QUANTITY && currentStage !== STAGE_PRODUCT_AMOUNT) {
    return null;
  }
  const sel = draft.selectedProduct;
  if (!sel) return null;

  if (currentStage === STAGE_PRODUCT_AMOUNT) {
    const amount = parseDecimal(answer);
    return amount
      ? calculateOrderCost({ type: "monto", id: sel.id, amount })
      : null;
  }

  const quantity = parseDecimal(answer);
  if (!quantity) return null;
  const type = sel.type === "kilo" ? "kilo" : "bolsa";
  return calculateOrderCost({ type, id: sel.id, quantity });
};

/**
 * FASE 2 — lógica de auto-respuesta del flujo guiado. Corre SIEMPRE dentro del
 * runWithTenant abierto por handleIncomingMessage (ya hay org activa). Envuelve
 * el I/O (enviar por Kapso + persistir la respuesta del bot + avanzar el stage)
 * alrededor de la decisión pura `planResponse`.
 *
 * FASE 4: resuelve el catálogo para el nodo (especies/etapas/marcas/productos),
 * captura la selección guiada, calcula el costo real al confirmar cantidad y
 * corta el flujo rígido hacia el asesoramiento Groq (tools con datos reales)
 * cuando el mensaje parece una consulta de producto.
 *
 * Guards para no disparar el flujo fuera de lugar:
 * - Org sin feature → salir (mantiene el comportamiento previo de FASE 1).
 * - Conversación en mode=HUMAN → el operador ya la tiene; solo se persiste la
 *   entrada del cliente y el flujo NO auto-responde.
 */
const applyFlowReply = async (input: {
  conversationId: string;
  phone: string;
  organizationId: string;
  currentStage: string | null;
  answer: string;
}): Promise<void> => {
  const { conversationId, phone, organizationId, currentStage, answer } = input;

  const flowEnabled =
    process.env.KAPSO_FLOW_ENABLED !== "false" &&
    process.env.KAPSO_FLOW_ENABLED !== "0";
  if (!flowEnabled) {
    console.debug("[whatsapp] flujo guiado deshabilitado (KAPSO_FLOW_ENABLED)");
    return;
  }

  // Re-leemos la conversación para validar ownership + mode (y obtener el stage
  // vigente + el acumulador del borrador). Conversation es tenant-model →
  // findFirst (no findUnique).
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId },
  });
  if (!conversation || conversation.mode !== "BOT") return;

  // ESCAPE / REINICIO (FASE 5): si el cliente escribe "hola", "empezar",
  // "cancelar", "nuevo pedido" en CUALQUIER nodo, reseteamos el flujo a cero
  // (stage null + borrador vacío) y arrancamos desde START. Sin esto el cliente
  // quedaría "atrapado" en un nodo (p.ej. el de marca) si escribe algo inesperado.
  if (isRestartIntent(answer)) {
    await prisma.conversation.updateMany({
      where: { id: conversationId },
      data: { whatsappStage: null, whatsappDraftData: Prisma.DbNull },
    });
    // Dejamos que el flujo arranque desde START: el siguiente bloque pasa por
    // currentStage null → planResponse saluda con la bienvenida + botones.
    return applyFlowReply({
      conversationId,
      phone,
      organizationId,
      currentStage: null,
      answer: "@start",
    });
  }

  // Consulta de producto ("para qué sirve X", "qué me recomendas"...) → Groq con
  // tools responde con datos reales en vez del flujo rígido de nodos. El flujo de
  // pedido (ids de botones) NO matchea estos patrones → se sigue guiando normal.
  if (isCatalogQuery(answer)) {
    await answerCatalogAdvice({ conversationId, phone, answer });
    return;
  }

  // Borrador acumulado hasta el mensaje anterior (sin el patch de este turno).
  const draftBefore =
    (conversation.whatsappDraftData as DraftData | null) ?? {};

  // Captura la selección guiada de ESTA respuesta (especie/etapa/marca/producto).
  // En el primer contacto (currentStage null) no hay selección que capturar.
  const selectionPatch = currentStage
    ? await captureSelectionFor(currentStage, answer, draftBefore)
    : {};
  const mergedDraft = mergeDraftData(draftBefore, selectionPatch);

  const orderType = (mergedDraft.orderType as string) ?? "bolsa";
  let catalog: FlowCatalog = {};
  let cost: { total: number; detail: string } | null = null;
  let confirmation: { message: string } | null = null;

  // Etapa sin match: el cliente escribió una etapa que no encontramos. Le pedimos
  // que la escriba de nuevo y nos quedamos en el mismo nodo (sin avanzar).
  if ((selectionPatch as any).stageNotFound) {
    const msg =
      "No encontré esa etapa 🐾 ¿Podés escribirla de nuevo? (ej: Adulto, Cachorro, Kitten, Senior) o pedí ayuda con un vendedor.";
    await sendText(phone, msg).catch(() => {});
    await persistMessage({
      conversationId,
      sender: "OPERATOR",
      senderUserId: null,
      isBot: true,
      body: msg,
    });
    await prisma.conversation.updateMany({
      where: { id: conversationId },
      data: { whatsappStage: STAGE_TYPED },
    });
    return;
  }

  // Marca sin match: el cliente escribió un nombre que no encontramos. Le pedimos
  // que la escriba de nuevo y nos quedamos en el mismo nodo (sin avanzar). Esto
  // evita que el flujo puro intente listar las 93 marcas (payload gigante).
  if ((selectionPatch as any).brandNotFound) {
    const msg =
      "Esa marca no está disponible para la etapa que elegiste 🤔 Probá con otra etapa (ej: Adulto, Cachorro) u otra marca. Si no la encontrás, pedí ayuda con un vendedor.";
    await sendText(phone, msg).catch(() => {});
    await persistMessage({
      conversationId,
      sender: "OPERATOR",
      senderUserId: null,
      isBot: true,
      body: msg,
    });
    await prisma.conversation.updateMany({
      where: { id: conversationId },
      data: { whatsappStage: STAGE_BRAND },
    });
    return;
  }

  // Producto sin selección: el cliente no eligió un producto válido en el nodo de
  // selección (escribió algo distinto a una opción). Frenamos y pedimos que elija
  // una de las opciones mostradas → evita el pedido SIN producto (bug crítico).
  if ((selectionPatch as any).productNotFound) {
    const msg =
      "Elegí uno de los productos de la lista 👇 (tocá un número) o escribí el nombre exacto. Si no aparece lo que buscás, pedí ayuda con un vendedor.";
    await sendText(phone, msg).catch(() => {});
    await persistMessage({
      conversationId,
      sender: "OPERATOR",
      senderUserId: null,
      isBot: true,
      body: msg,
    });
    await prisma.conversation.updateMany({
      where: { id: conversationId },
      data: { whatsappStage: STAGE_PRODUCT_SELECT },
    });
    return;
  }

  // Armamos el catálogo para el NODO destino usando la selección ya actualizada,
  // para que el flujo puro arme los botones/mensajes del paso siguiente. El costo
  // REAL del ítem se calcula al confirmar la cantidad/importe (fuente: la DB).
  if (currentStage) {
    const next = nextStageForAnswer(currentStage, answer, { orderType });
    catalog = await catalogForStage(next, mergedDraft);

    const isQtyOrAmount =
      currentStage === STAGE_PRODUCT_QUANTITY ||
      currentStage === STAGE_PRODUCT_AMOUNT;

    // FASE 6 — MATCHEO del producto. Al confirmar cantidad/importe el bot intenta
    // resolver un producto real con los atributos capturados (marca×especie×etapa×
    // peso). Si hay match lo guarda en selectedProduct (para el costo + el ítem);
    // si no, la línea queda como requerimiento (selectedProduct null) para el
    // operador.
    if (isQtyOrAmount) {
      const match = await matchProductForDraft({
        species: (mergedDraft.selectedSpecies as string) ?? null,
        brandId: (mergedDraft.selectedBrandId as string) ?? null,
        stageId: (mergedDraft.selectedStageId as string) ?? null,
        sizeText: (mergedDraft.sizeText as string) ?? null,
        orderType,
      });
      if (match) {
        mergedDraft.selectedProduct = match;
      } else {
        delete mergedDraft.selectedProduct;
      }
    }

    cost = await computeItemCost(currentStage, answer, mergedDraft);
    if (isQtyOrAmount) {
      // Mensaje de confirmación: con match muestra el producto + precio; sin match
      // avisa que un asesor arma el pedido. Se antepone a la pregunta siguiente.
      const sel = mergedDraft.selectedProduct as
        | { id?: string; name?: string; type?: string }
        | undefined;
      confirmation = {
        message: sel
          ? `Encontré: ${sel.name} — $${formatMoney(cost?.total ?? 0)}. ¿Te lo confirmo? 🙌`
          : "Cargué tus datos, un asesor arma el pedido. 🙌",
      };

      const itemQty =
        currentStage === STAGE_PRODUCT_QUANTITY
          ? parseDecimal(answer)
          : (mergedDraft.quantityKg as number) ?? null;
      const itemAmount =
        currentStage === STAGE_PRODUCT_AMOUNT
          ? parseDecimal(answer)
          : (mergedDraft.amount as number) ?? null;

      // Resolvemos los nombres legibles (marca, etapa) para que el operador lea la
      // línea completa sin depender de ids del catálogo.
      const [marca, etapa] = await Promise.all([
        brandNameById((mergedDraft.selectedBrandId as string) ?? null),
        stageNameById((mergedDraft.selectedStageId as string) ?? null),
      ]);

      // Acumulamos la línea para el multi-producto. Sin match es un requerimiento:
      // productId/productName quedan null y el operador lo arma desde los atributos.
      const items = Array.isArray(mergedDraft.items) ? [...mergedDraft.items] : [];
      items.push({
        productId: sel?.id ?? null,
        productName: sel?.name ?? null,
        type: sel?.type ?? (mergedDraft.orderType as string) ?? null,
        quantity: itemQty,
        amount: itemAmount,
        detail: cost?.detail ?? null,
        total: cost?.total ?? null,
        marca,
        especie: SPECIES_LABELS[(mergedDraft.selectedSpecies as string) ?? ""] ?? null,
        etapa,
        peso: (mergedDraft.sizeText as string) ?? null,
        observacion: (mergedDraft.notes as string | null) ?? null,
      });
      mergedDraft.items = items;
    }
  }

  const plan = planResponse({
    currentStage,
    answer,
    qrImageUrl: process.env.KAPSO_QR_IMAGE_URL,
    catalog,
    cost,
    orderType,
    confirmation,
  });

  // Handoff directo (consulta / "otro"): el cliente ve UN único mensaje puente,
  // el que emite escalateConversation. Acá NO mandamos el de planResponse para
  // no duplicar el aviso. Tampoco acumulamos borrador: esto NO es un pedido.
  if (isHandoffStage(plan.nextStage)) {
    await escalateConversation(conversationId, organizationId);
    await prisma.conversation.updateMany({
      where: { id: conversationId },
      data: { whatsappStage: null },
    });
    return;
  }

  // FASE 3 — captura del borrador (campos simples: cantidad, importe, dirección,
  // pago, tipo). Ya mergeamos la selección guiada arriba; acá sumamos el resto.
  const draftPatch = buildDraftData(currentStage, answer);
  const finalDraft = Object.keys(draftPatch).length > 0
    ? mergeDraftData(mergedDraft, draftPatch)
    : mergedDraft;
  // FASE 6 — la observación (NOTES) se captura DESPUÉS de confirmar cada línea, así
  // que atrasamos en `observacion` por ítem el valor global del pedido (si el ítem
  // todavía no lo tenía). Idempotente: no pisa una observación por línea ya definida.
  if (Array.isArray(finalDraft.items)) {
    const notesValue = (finalDraft.notes as string | null) ?? null;
    finalDraft.items = finalDraft.items.map((it: any) =>
      it && typeof it === "object"
        ? { ...it, observacion: it.observacion ?? notesValue }
        : it,
    );
  }
  if (
    Object.keys(draftPatch).length > 0 ||
    Object.keys(selectionPatch).length > 0
  ) {
    await prisma.conversation.updateMany({
      where: { id: conversationId },
      data: { whatsappDraftData: finalDraft },
    });
  }

  // Envío de salida. Un fallo de Kapso NO debe romper la persistencia del stage.
  try {
    if (plan.sendImage && process.env.KAPSO_QR_IMAGE_URL) {
      const sent = await sendImage(phone, process.env.KAPSO_QR_IMAGE_URL, plan.message);
      if (!sent) console.error("[whatsapp] sendImage devolvió false — QR/pago no entregado");
    } else if (plan.buttons && plan.buttons.length > 0) {
      const sent = await sendInteractiveButtons(phone, plan.message, plan.buttons);
      if (!sent) console.error("[whatsapp] sendInteractiveButtons devolvió false — botones no entregados");
    } else {
      const sent = await sendText(phone, plan.message);
      if (!sent) console.error("[whatsapp] sendText devolvió false — respuesta no entregada");
    }
  } catch (err) {
    console.error("[whatsapp] envío de respuesta del flujo falló", err);
  }

  // La respuesta del bot se persiste como mensaje para que el operador vea el
  // intercambio completo al tomar la conversación (sender=OPERATOR, isBot=true).
  await persistMessage({
    conversationId,
    sender: "OPERATOR",
    senderUserId: null,
    isBot: true,
    body: plan.message,
  });

  // Avanzar el nodo. En terminales (DONE / PAYMENT_DONE) el flujo se cierra y lo
  // toma un humano → whatsappStage se limpia (queda fuera del flujo guiado) y el
  // acumulador del borrador se resetea (ya se volcó al WhatsAppOrderDraft).
  const terminal = isTerminalStage(plan.nextStage);
  await prisma.conversation.updateMany({
    where: { id: conversationId },
    data: {
      whatsappStage: terminal ? null : plan.nextStage,
      // Json nullable: para limpiar el acumulador hay que pasar Prisma.DbNull
      // (SQL NULL), ya que `null` plano no es un valor aceptado por la API de Prisma.
      ...(terminal ? { whatsappDraftData: Prisma.DbNull } : {}),
    },
  });

  // Terminal → crear el borrador de pedido (FASE 3) y handoff a humano. El
  // pedido real recién se crea cuando el vendedor lo aprueba en el ERP.
  if (terminal) {
    const selectedProduct = finalDraft.selectedProduct as
      | { id: string; type: string; name: string; price: number }
      | undefined;
    // `items` es Json? → array que Prisma serializa a JSONB; vacío/ausente se
    // persiste como SQL NULL (Prisma.DbNull). `notes` vacío → null.
    const itemsJson = Array.isArray(finalDraft.items)
      ? (finalDraft.items as unknown as Prisma.JsonValue[])
      : Prisma.DbNull;
    const notesValue = ((finalDraft.notes as string) ?? "").trim();
    await prisma.whatsAppOrderDraft.create({
      data: {
        organizationId,
        conversationId,
        phone: conversation.guestPhone ?? phone,
        contactName: conversation.guestName,
        customerId: conversation.customerId ?? null,
        orderType: (finalDraft.orderType as string) ?? "otro",
        productText: selectedProduct?.name ?? (finalDraft.productText as string) ?? null,
        quantityKg: (finalDraft.quantityKg as number) ?? null,
        amount: (finalDraft.amount as number) ?? null,
        address: (finalDraft.address as string) ?? null,
        paymentMethod: (finalDraft.paymentMethod as string) ?? "efectivo",
        items: itemsJson,
        notes: notesValue || null,
        status: "PENDING_REVIEW",
      },
    });
    await escalateConversation(conversationId, organizationId);
  }
};

/**
 * Gateway de salida: manda un texto simple por WhatsApp (FASE 2, listo).
 * Devuelve true si Kapso respondió 2xx; cualquier error → false (logueado).
 */
export const sendText = async (to: string, body: string): Promise<boolean> => {
  const baseUrl =
    process.env.KAPSO_BASE_URL ?? "https://api.kapso.ai/meta/whatsapp";
  const url = `${baseUrl}/v24.0/${process.env.KAPSO_PHONE_NUMBER_ID}/messages`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "X-API-Key": process.env.KAPSO_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body },
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(
        `[kapso] sendText no-2xx (${res.status}) a ${to} — payload ${body.length} chars`,
        detail,
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error("[kapso] sendText falló", err);
    return false;
  }
};

/**
 * Gateway de salida: manda botones interactivos (FASE 2, listo). Máx. 3 botones
 * (lo exige WhatsApp). Igual que sendText: true si 2xx, false en error.
 */
export const sendInteractiveButtons = async (
  to: string,
  bodyText: string,
  buttons: { id: string; title: string }[],
): Promise<boolean> => {
  const baseUrl =
    process.env.KAPSO_BASE_URL ?? "https://api.kapso.ai/meta/whatsapp";
  const url = `${baseUrl}/v24.0/${process.env.KAPSO_PHONE_NUMBER_ID}/messages`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "X-API-Key": process.env.KAPSO_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: bodyText },
          action: {
            buttons: buttons.map((b) => ({
              type: "reply",
              reply: { id: b.id, title: b.title },
            })),
          },
        },
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(
        `[kapso] sendInteractiveButtons no-2xx (${res.status}) a ${to} — ${buttons.length} botones`,
        detail,
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error("[kapso] sendInteractiveButtons falló", err);
    return false;
  }
};

/**
 * Gateway de salida: manda una imagen (FASE 2 — QR de pago). Caption va DENTRO
 * de `image` (así lo pide la API de Meta). Igual que sendText: true si 2xx.
 */
export const sendImage = async (
  to: string,
  imageUrl: string,
  caption?: string,
): Promise<boolean> => {
  const baseUrl =
    process.env.KAPSO_BASE_URL ?? "https://api.kapso.ai/meta/whatsapp";
  const url = `${baseUrl}/v24.0/${process.env.KAPSO_PHONE_NUMBER_ID}/messages`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "X-API-Key": process.env.KAPSO_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "image",
        image: { link: imageUrl, ...(caption ? { caption } : {}) },
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(
        `[kapso] sendImage no-2xx (${res.status}) a ${to} — url ${imageUrl}`,
        detail,
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error("[kapso] sendImage falló", err);
    return false;
  }
};

export default {
  verifyWebhookSignature,
  normalizePhone,
  resolveOrgIdBySlug,
  getOrCreateWhatsAppConversation,
  handleIncomingMessage,
  isCatalogQuery,
  sendText,
  sendInteractiveButtons,
  sendImage,
};

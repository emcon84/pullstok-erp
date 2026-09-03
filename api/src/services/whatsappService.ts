import { createHmac, timingSafeEqual } from "crypto";
import { prisma, basePrisma } from "../config/db";
import { runWithTenant, requireOrganizationId } from "../config/tenantContext";
import { persistMessage, escalateConversation } from "./chatService";
import {
  planResponse,
  isHandoffStage,
  isTerminalStage,
} from "./whatsappFlow";

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

/**
 * FASE 2 — lógica de auto-respuesta del flujo guiado. Corre SIEMPRE dentro del
 * runWithTenant abierto por handleIncomingMessage (ya hay org activa). Envuelve
 * el I/O (enviar por Kapso + persistir la respuesta del bot + avanzar el stage)
 * alrededor de la decisión pura `planResponse`.
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
  // vigente). Conversation es tenant-model → findFirst (no findUnique).
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId },
  });
  if (!conversation || conversation.mode !== "BOT") return;

  const plan = planResponse({
    currentStage,
    answer,
    qrImageUrl: process.env.KAPSO_QR_IMAGE_URL,
  });

  // Handoff directo (consulta / "otro"): el cliente ve UN único mensaje puente,
  // el que emite escalateConversation. Acá NO mandamos el de planResponse para
  // no duplicar el aviso.
  if (isHandoffStage(plan.nextStage)) {
    await escalateConversation(conversationId, organizationId);
    await prisma.conversation.updateMany({
      where: { id: conversationId },
      data: { whatsappStage: null },
    });
    return;
  }

  // Envío de salida. Un fallo de Kapso NO debe romper la persistencia del stage.
  try {
    if (plan.sendImage && process.env.KAPSO_QR_IMAGE_URL) {
      await sendImage(phone, process.env.KAPSO_QR_IMAGE_URL, plan.message);
    } else if (plan.buttons && plan.buttons.length > 0) {
      await sendInteractiveButtons(phone, plan.message, plan.buttons);
    } else {
      await sendText(phone, plan.message);
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
  // toma un humano → whatsappStage se limpia (queda fuera del flujo guiado).
  const terminal = isTerminalStage(plan.nextStage);
  await prisma.conversation.updateMany({
    where: { id: conversationId },
    data: { whatsappStage: terminal ? null : plan.nextStage },
  });

  // Terminal → handoff a humano (flipea mode a HUMAN).
  if (terminal) {
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
    return res.ok;
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
    return res.ok;
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
    return res.ok;
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
  sendText,
  sendInteractiveButtons,
  sendImage,
};

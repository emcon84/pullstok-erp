import { createHmac, timingSafeEqual } from "crypto";
import { prisma, basePrisma } from "../config/db";
import { runWithTenant, requireOrganizationId } from "../config/tenantContext";
import { persistMessage } from "./chatService";

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
 * Orquestador del mensaje entrante de Kapso. Extrae phone + texto, resuelve la
 * org por slug y persiste la conversación/mensaje dentro de un runWithTenant
 * con el orgId de la org → persistMessage dispara todo el realtime (chat:message
 * y chat:conversation-updated). Cualquier payload sin datos de texto se ignora
 * (los interactive/buttons son FASE 2).
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

  const body =
    payload.message?.text?.body ??
    payload.message?.kapso?.content ??
    payload.kapso?.content ??
    "";
  if (!body || body.trim().length === 0) {
    console.warn(
      "[whatsapp] mensaje sin texto (interactive/buttons = FASE 2), se ignora",
    );
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
      await persistMessage({ conversationId: conv.id, sender: "GUEST", body });

      // FASE 2 — auto-reply con botones vía el bot IA. No disparar aún:
      // maybeReplyToGuestMessage({ conversationId: conv.id, organizationId: orgId });
    },
  );
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

export default {
  verifyWebhookSignature,
  normalizePhone,
  resolveOrgIdBySlug,
  getOrCreateWhatsAppConversation,
  handleIncomingMessage,
  sendText,
  sendInteractiveButtons,
};

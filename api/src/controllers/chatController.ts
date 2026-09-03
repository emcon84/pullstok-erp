import { Response } from "express";
import { AuthedRequest } from "../middlewares/authMiddleware";
import { GuestRequest } from "../middlewares/requireGuest";
import { generateGuestToken } from "../utils/jwtUtils";
import { requireOrganizationId } from "../config/tenantContext";
import {
  startConversation,
  persistMessage,
  listConversations,
  getConversationMessages,
  findOrgConversation,
  toMessageDTO,
  escalateConversation,
} from "../services/chatService";
import { maybeReplyToGuestMessage } from "../services/botService";
import { sendText } from "../services/whatsappService";

// ===========================================================================
// TIENDA (guest — público, tenant por slug/token)
// ===========================================================================

// POST /api/store/chat/start — el visitante se presenta (name + email). Reusa
// una conversación OPEN del mismo email o crea una nueva (ver chatService).
// Devuelve un guest token atado a esa conversación + el historial.
const startChat = async (req: GuestRequest, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const { name, email } = req.body as { name: string; email: string };

    const { conversationId, messages } = await startConversation({ name, email });

    const token = generateGuestToken({
      organizationId,
      conversationId,
      guestEmail: email,
    });

    res.status(201).json({
      token,
      conversationId,
      messages: messages.map(toMessageDTO),
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/store/chat/message — protegido por requireGuest. El guest solo
// escribe en SU conversación (la del token); el conversationId NO viene del body.
const postGuestMessage = async (req: GuestRequest, res: Response) => {
  try {
    const { conversationId } = req.guest!;
    const { body } = req.body as { body: string };

    const message = await persistMessage({
      conversationId,
      sender: "GUEST",
      body,
    });

    res.status(201).json(toMessageDTO(message));

    // Bot IA (FASE 1): DESPUÉS de persistir el mensaje del guest y responder el
    // HTTP, disparamos la respuesta del bot FIRE-AND-FORGET (nunca se espera →
    // no bloquea al visitante). El botService decide adentro si corresponde
    // responder (org PREMIUM, BotConfig.enabled, conversación en mode=BOT, bajo
    // el límite diario) y abre su propio contexto de tenant. Cualquier fallo se
    // traga adentro; el mensaje del guest ya está guardado y respondido.
    maybeReplyToGuestMessage({
      conversationId,
      organizationId: req.guest!.organizationId,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/store/chat/escalate — protegido por requireGuest. FASE 2: escalado
// MANUAL (el visitante toca "hablar con una persona" en el widget). Escala SU
// conversación (la del token) a HUMAN; el bot se calla y se avisa a los
// operadores. Idempotente (escalar una conversación ya en HUMAN es no-op). No
// recibe body.
const escalateChat = async (req: GuestRequest, res: Response) => {
  try {
    const { conversationId, organizationId } = req.guest!;
    await escalateConversation(conversationId, organizationId);
    res.status(200).json({ ok: true, mode: "HUMAN" });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// ===========================================================================
// ERP (operador — auth JWT, scoped por org)
// ===========================================================================

// GET /api/chat/conversations — bandeja del operador (última actividad desc,
// último mensaje y no-leídos por conversación).
const getConversations = async (_req: AuthedRequest, res: Response) => {
  try {
    const conversations = await listConversations();
    res.status(200).json(conversations);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/chat/conversations/:id/messages — historial. Valida que la
// conversación sea de la org del operador (findOrgConversation es scoped).
const getMessages = async (req: AuthedRequest, res: Response) => {
  try {
    const conversation = await findOrgConversation(req.params.id);
    if (!conversation) {
      return res.status(404).json({ message: "Conversación no encontrada" });
    }
    const messages = await getConversationMessages(conversation.id);
    res.status(200).json(messages.map(toMessageDTO));
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/chat/conversations/:id/messages — el operador responde. senderUserId
// = id del operador del JWT. Valida ownership por org antes de escribir.
const postOperatorMessage = async (req: AuthedRequest, res: Response) => {
  try {
    const conversation = await findOrgConversation(req.params.id);
    if (!conversation) {
      return res.status(404).json({ message: "Conversación no encontrada" });
    }
    const { body } = req.body as { body: string };

    const message = await persistMessage({
      conversationId: conversation.id,
      sender: "OPERATOR",
      senderUserId: req.user!.id,
      body,
    });

    // WhatsApp (FASE 5): si el cliente llegó por WhatsApp, la respuesta del
    // operador debe viajar de vuelta por Kapso (hoy solo se persiste y se emite
    // por socket, pero el cliente en WhatsApp no la ve). Enviamos con sendText;
    // un fallo de Kapso NUNCA debe romper la respuesta HTTP ni la persistencia —
    // el mensaje ya quedó guardado en la bandeja del operador.
    if (conversation.channel === "WHATSAPP" && conversation.guestPhone) {
      sendText(conversation.guestPhone, body).catch((err) => {
        console.error("[chat] no se pudo enviar la respuesta a WhatsApp", err);
      });
    }

    res.status(201).json(toMessageDTO(message));
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export default {
  startChat,
  postGuestMessage,
  escalateChat,
  getConversations,
  getMessages,
  postOperatorMessage,
};

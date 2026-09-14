import { Request, Response } from "express";
import { AuthedRequest } from "../middlewares/authMiddleware";
import { requireOrganizationId } from "../config/tenantContext";
import * as vendorChatService from "../services/vendorChatService";
import {
  createVendorChat,
  listVendorChats,
  getVendorChatById,
  closeVendorChat,
  sendVendorMessage,
} from "../services/vendorChatService";

// POST /vendor-chat/conversations — crear conversación de asistente de ventas
const createConversation = async (req: AuthedRequest, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const { sellerId } = req.body as { sellerId: string };

    if (!sellerId) {
      return res.status(400).json({ message: "sellerId es requerido" });
    }

    const chat = await createVendorChat({
      organizationId,
      sellerId,
    });

    res.status(201).json(chat);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// GET /vendor-chat/conversations — listar conversaciones del vendedor
const listConversations = async (req: AuthedRequest, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const chats = await listVendorChats({ organizationId });
    res.status(200).json(chats);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// GET /vendor-chat/conversations/:id — detalle de conversación con mensajes
const getConversation = async (req: AuthedRequest, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const chat = await getVendorChatById(req.params.id);

    if (!chat || chat.organizationId !== organizationId) {
      return res.status(404).json({ message: "Conversación no encontrada" });
    }

    res.status(200).json(chat);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// POST /vendor-chat/messages — enviar mensaje en conversación de ventas
const postMessage = async (req: AuthedRequest, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const { vendorChatId, sender, body } = req.body as {
      vendorChatId: string;
      sender: "SELLER" | "ASSISTANT";
      body: string;
    };

    if (!vendorChatId || !sender || !body) {
      return res.status(400).json({ message: "vendorChatId, sender y body son requeridos" });
    }

    const message = await sendVendorMessage({
      vendorChatId,
      organizationId,
      sender,
      body,
    });

    res.status(201).json(message);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// POST /vendor-chat/conversations/:id/close — cerrar conversación
const closeConversation = async (req: AuthedRequest, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const chat = await getVendorChatById(req.params.id);

    if (!chat || chat.organizationId !== organizationId) {
      return res.status(404).json({ message: "Conversación no encontrada" });
    }

    if (chat.status === "CLOSED") {
      return res.status(409).json({ message: "La conversación ya está cerrada" });
    }

    await closeVendorChat(req.params.id);

    res.status(200).json({ ok: true, status: "CLOSED" });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export default {
  createConversation,
  listConversations,
  getConversation,
  postMessage,
  closeConversation,
};

import { Request, Response } from "express";
import vendorChatController from "../../src/controllers/vendorChatController";
import { prisma } from "../../src/config/db";
import { requireOrganizationId } from "../../src/config/tenantContext";

jest.mock("../../src/config/db", () => ({
  prisma: {
    vendorChat: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    vendorChatMessage: {
      create: jest.fn(),
    },
  },
}));

jest.mock("../../src/config/tenantContext", () => ({
  requireOrganizationId: jest.fn().mockReturnValue("org-1"),
}));

const mockedPrisma = prisma as unknown as {
  vendorChat: {
    create: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    updateMany: jest.Mock;
  };
  vendorChatMessage: { create: jest.Mock };
};

const mockAuthedRequest = (
  role: string = "VENDEDOR",
  params: Record<string, string> = {},
  body: Record<string, any> = {},
) =>
  ({
    params,
    query: {},
    body,
    user: { id: "user-1", role, organizationId: "org-1" },
  } as unknown as Request);

const mockResponse = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("vendorChatController — integration (auth, tenant, 409)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Tenant scoping ──

  describe("tenant scoping", () => {
    it("createConversation incluye organizationId del tenant", async () => {
      mockedPrisma.vendorChat.create.mockResolvedValue({
        id: "chat-1",
        organizationId: "org-1",
        sellerId: "seller-1",
        status: "ACTIVE",
      });
      const req = mockAuthedRequest("VENDEDOR", {}, { sellerId: "seller-1" });
      const res = mockResponse();

      await vendorChatController.createConversation(req, res as Response);

      expect(mockedPrisma.vendorChat.create).toHaveBeenCalledWith({
        data: {
          organizationId: "org-1",
          sellerId: "seller-1",
          status: "ACTIVE",
        },
      });
    });

    it("listConversations filtra por org del tenant", async () => {
      mockedPrisma.vendorChat.findMany.mockResolvedValue([]);
      const req = mockAuthedRequest("VENDEDOR");
      const res = mockResponse();

      await vendorChatController.listConversations(req, res as Response);

      expect(mockedPrisma.vendorChat.findMany).toHaveBeenCalledWith({
        where: { organizationId: "org-1" },
        orderBy: { updatedAt: "desc" },
        include: { _count: { select: { messages: true } } },
      });
    });

    it("getConversation valida que la conversacion pertenece a la org", async () => {
      mockedPrisma.vendorChat.findFirst.mockResolvedValue(null);
      const req = mockAuthedRequest("VENDEDOR", { id: "chat-999" });
      const res = mockResponse();

      await vendorChatController.getConversation(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        message: "Conversación no encontrada",
      });
    });

    it("getConversation devuelve la conversacion de la org", async () => {
      const chat = {
        id: "chat-1",
        organizationId: "org-1",
        sellerId: "seller-1",
        status: "ACTIVE",
        messages: [],
      };
      mockedPrisma.vendorChat.findFirst.mockResolvedValue(chat);
      const req = mockAuthedRequest("VENDEDOR", { id: "chat-1" });
      const res = mockResponse();

      await vendorChatController.getConversation(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(chat);
    });
  });

  // ── 409 on closed chat ──

  describe("closeConversation — 409 en chat cerrado", () => {
    it("retorna 409 si la conversacion ya esta CLOSED", async () => {
      mockedPrisma.vendorChat.findFirst.mockResolvedValue({
        id: "chat-1",
        organizationId: "org-1",
        status: "CLOSED",
      });
      const req = mockAuthedRequest("VENDEDOR", { id: "chat-1" });
      const res = mockResponse();

      await vendorChatController.closeConversation(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        message: "La conversación ya está cerrada",
      });
      expect(mockedPrisma.vendorChat.updateMany).not.toHaveBeenCalled();
    });

    it("cierra conversacion ACTIVE con 200", async () => {
      mockedPrisma.vendorChat.findFirst.mockResolvedValue({
        id: "chat-1",
        organizationId: "org-1",
        status: "ACTIVE",
      });
      mockedPrisma.vendorChat.updateMany.mockResolvedValue({ count: 1 });
      const req = mockAuthedRequest("VENDEDOR", { id: "chat-1" });
      const res = mockResponse();

      await vendorChatController.closeConversation(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ ok: true, status: "CLOSED" });
      expect(mockedPrisma.vendorChat.updateMany).toHaveBeenCalledWith({
        where: { id: "chat-1" },
        data: { status: "CLOSED" },
      });
    });

    it("retorna 404 para conversacion de otra org", async () => {
      mockedPrisma.vendorChat.findFirst.mockResolvedValue({
        id: "chat-otra",
        organizationId: "org-otra",
        status: "ACTIVE",
      });
      const req = mockAuthedRequest("VENDEDOR", { id: "chat-otra" });
      const res = mockResponse();

      await vendorChatController.closeConversation(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  // ── POST /messages ──

  describe("POST /messages", () => {
    it("crea mensaje con datos correctos", async () => {
      const msg = {
        id: "msg-1",
        vendorChatId: "chat-1",
        organizationId: "org-1",
        sender: "SELLER",
        isBot: false,
        body: "Hola asistente",
        ragContext: null,
        createdAt: new Date().toISOString(),
      };
      mockedPrisma.vendorChatMessage.create.mockResolvedValue(msg);
      const req = mockAuthedRequest("VENDEDOR", {}, {
        vendorChatId: "chat-1",
        sender: "SELLER",
        body: "Hola asistente",
      });
      const res = mockResponse();

      await vendorChatController.postMessage(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockedPrisma.vendorChatMessage.create).toHaveBeenCalledWith({
        data: {
          vendorChatId: "chat-1",
          organizationId: "org-1",
          sender: "SELLER",
          body: "Hola asistente",
          isBot: false,
          ragContext: null,
        },
      });
    });

    it("retorna 400 sin campos requeridos", async () => {
      const req = mockAuthedRequest("VENDEDOR", {}, { body: "sin vendorChatId" });
      const res = mockResponse();

      await vendorChatController.postMessage(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});

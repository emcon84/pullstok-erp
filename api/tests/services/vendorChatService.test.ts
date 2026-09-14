import {
  buildRAGContext,
  createVendorChat,
  listVendorChats,
  getVendorChatById,
  closeVendorChat,
  sendVendorMessage,
} from "../../src/services/vendorChatService";
import { prisma } from "../../src/config/db";
import { requireOrganizationId } from "../../src/config/tenantContext";

jest.mock("../../src/config/db", () => ({
  prisma: {
    product: { findMany: jest.fn() },
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
  product: { findMany: jest.Mock };
  vendorChat: {
    create: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    updateMany: jest.Mock;
  };
  vendorChatMessage: { create: jest.Mock };
};

describe("vendorChatService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── buildRAGContext ──

  describe("buildRAGContext (RAG injection)", () => {
    it("retorna contexto con productos relevantes", async () => {
      mockedPrisma.product.findMany.mockResolvedValue([
        {
          name: "Croquetas Premium 15kg",
          price: 45000,
          quantity: 30,
          description: "Alimento premium para perros",
          category: { name: "Alimento Seco" },
        },
        {
          name: "Juguete Mordedor",
          price: 3500,
          quantity: 15,
          description: null,
          category: { name: "Accesorios" },
        },
      ]);

      const result = await buildRAGContext("croquetas para perro");

      expect(result).toContain("Croquetas Premium");
      expect(result).toContain("Juguete Mordedor");
      expect(result).toContain("Alimento Seco");
      expect(result).toContain("Accesorios");
      expect(mockedPrisma.product.findMany).toHaveBeenCalledWith({
        where: expect.any(Object),
        select: {
          name: true,
          price: true,
          quantity: true,
          description: true,
          category: { select: { name: true } },
        },
        take: 50,
      });
    });

    it("retorna string vacio si no hay productos", async () => {
      mockedPrisma.product.findMany.mockResolvedValue([]);

      const result = await buildRAGContext("producto inexistente");

      expect(result).toBe("");
    });

    it("retorna string vacio para mensaje vacio", async () => {
      const result = await buildRAGContext("");
      expect(result).toBe("");
    });

    it("respeta el cap de 5000 caracteres", async () => {
      const longProducts = Array.from({ length: 60 }, (_, i) => ({
        name: `Producto Largo ${i} con nombre extenso para llenar caracteres`,
        price: 1000 + i,
        quantity: 10,
        description:
          "Descripcion muy larga que excede el cap de caracteres permitido para inyeccion RAG en el contexto del asistente",
        category: { name: "Categoria" },
      }));
      mockedPrisma.product.findMany.mockResolvedValue(longProducts);

      const result = await buildRAGContext("productos");

      expect(result.length).toBeLessThanOrEqual(5000);
    });
  });

  // ── CRUD ──

  describe("createVendorChat", () => {
    it("crea conversacion con orgId correcto", async () => {
      const chat = { id: "chat-1", organizationId: "org-1", sellerId: "user-1", status: "ACTIVE" };
      mockedPrisma.vendorChat.create.mockResolvedValue(chat);

      const result = await createVendorChat({
        organizationId: "org-1",
        sellerId: "user-1",
      });

      expect(mockedPrisma.vendorChat.create).toHaveBeenCalledWith({
        data: {
          organizationId: "org-1",
          sellerId: "user-1",
          status: "ACTIVE",
        },
      });
      expect(result).toEqual(chat);
    });

    it("usa requireOrganizationId si no se pasa orgId", async () => {
      const chat = { id: "chat-1", organizationId: "org-1", sellerId: "user-1", status: "ACTIVE" };
      mockedPrisma.vendorChat.create.mockResolvedValue(chat);

      await createVendorChat({ sellerId: "user-1" });

      expect(requireOrganizationId).toHaveBeenCalled();
      expect(mockedPrisma.vendorChat.create).toHaveBeenCalledWith({
        data: {
          organizationId: "org-1",
          sellerId: "user-1",
          status: "ACTIVE",
        },
      });
    });
  });

  describe("listVendorChats", () => {
    it("lista conversaciones filtrando por orgId", async () => {
      mockedPrisma.vendorChat.findMany.mockResolvedValue([
        { id: "c1", organizationId: "org-1", sellerId: "s1", status: "ACTIVE", _count: { messages: 3 } },
      ]);

      const result = await listVendorChats({ organizationId: "org-1" });

    expect(mockedPrisma.vendorChat.findMany).toHaveBeenCalledWith({
      where: { organizationId: "org-1" },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { messages: true } } },
    });
      expect(result).toHaveLength(1);
    });
  });

  describe("getVendorChatById", () => {
    it("busca conversacion por id", async () => {
      const chat = {
        id: "chat-1",
        organizationId: "org-1",
        messages: [],
      };
      mockedPrisma.vendorChat.findFirst.mockResolvedValue(chat);

      const result = await getVendorChatById("chat-1");

      expect(mockedPrisma.vendorChat.findFirst).toHaveBeenCalledWith({
        where: { id: "chat-1" },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
      expect(result).toEqual(chat);
    });
  });

  describe("closeVendorChat", () => {
    it("cierra conversacion ACTIVE", async () => {
      mockedPrisma.vendorChat.findFirst.mockResolvedValue({
        id: "chat-1",
        status: "ACTIVE",
      });
      mockedPrisma.vendorChat.updateMany.mockResolvedValue({ count: 1 });

      const result = await closeVendorChat("chat-1");

      expect(mockedPrisma.vendorChat.updateMany).toHaveBeenCalledWith({
        where: { id: "chat-1" },
        data: { status: "CLOSED" },
      });
      expect(result).toBeDefined();
    });

    it("retorna la chat sin modificar si ya esta CLOSED", async () => {
      mockedPrisma.vendorChat.findFirst.mockResolvedValue({
        id: "chat-1",
        status: "CLOSED",
      });

      const result = await closeVendorChat("chat-1");

      expect(mockedPrisma.vendorChat.updateMany).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe("sendVendorMessage", () => {
    it("persiste mensaje con orgId y campos correctos", async () => {
      const msg = {
        id: "msg-1",
        vendorChatId: "chat-1",
        organizationId: "org-1",
        sender: "SELLER" as const,
        isBot: false,
        body: "hola",
        ragContext: null,
        createdAt: new Date().toISOString(),
      };
      mockedPrisma.vendorChatMessage.create.mockResolvedValue(msg);

      const result = await sendVendorMessage({
        vendorChatId: "chat-1",
        organizationId: "org-1",
        sender: "SELLER",
        body: "hola",
      });

      expect(mockedPrisma.vendorChatMessage.create).toHaveBeenCalledWith({
        data: {
          vendorChatId: "chat-1",
          organizationId: "org-1",
          sender: "SELLER",
          body: "hola",
          isBot: false,
          ragContext: null,
        },
      });
      expect(result).toEqual(msg);
    });

    it("isBot=true cuando sender=ASSISTANT", async () => {
      const msg = {
        id: "msg-1",
        vendorChatId: "chat-1",
        organizationId: "org-1",
        sender: "ASSISTANT" as const,
        isBot: true,
        body: "hola",
        ragContext: null,
        createdAt: new Date().toISOString(),
      };
      mockedPrisma.vendorChatMessage.create.mockResolvedValue(msg);

      await sendVendorMessage({
        vendorChatId: "chat-1",
        organizationId: "org-1",
        sender: "ASSISTANT",
        body: "hola",
      });

      expect(mockedPrisma.vendorChatMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ isBot: true }) }),
      );
    });

    it("incluye ragContext cuando se provee", async () => {
      const msg = {
        id: "msg-1",
        vendorChatId: "chat-1",
        organizationId: "org-1",
        sender: "SELLER" as const,
        isBot: false,
        body: "hola",
        ragContext: "Producto: Ejemplo",
        createdAt: new Date().toISOString(),
      };
      mockedPrisma.vendorChatMessage.create.mockResolvedValue(msg);

      await sendVendorMessage({
        vendorChatId: "chat-1",
        organizationId: "org-1",
        sender: "SELLER",
        body: "hola",
        ragContext: "Producto: Ejemplo",
      });

      expect(mockedPrisma.vendorChatMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ ragContext: "Producto: Ejemplo" }) }),
      );
    });
  });

  // ── Tenant scoping ──

  describe("Tenant scoping", () => {
    it("listVendorChats solo retorna conversaciones de la org", async () => {
      mockedPrisma.vendorChat.findMany.mockResolvedValue([]);

      await listVendorChats({ organizationId: "org-2" });

      expect(mockedPrisma.vendorChat.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: "org-2" } }),
      );
    });

    it("createVendorChat asocia la org correcta", async () => {
      mockedPrisma.vendorChat.create.mockResolvedValue({ id: "c1" });

      await createVendorChat({ organizationId: "org-diferente", sellerId: "s1" });

      expect(mockedPrisma.vendorChat.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ organizationId: "org-diferente" }) }),
      );
    });
  });
});

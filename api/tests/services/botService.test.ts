import { generateBotReply, getVendorChatUsageToday, incrementVendorChatUsage } from "../../src/services/botService";
import { basePrisma } from "../../src/config/db";
import type { Message } from "@prisma/client";
import * as seqService from "../../src/services/secuenceService";

jest.mock("../../src/config/db", () => ({
  basePrisma: {
    counter: {
      findFirst: jest.fn(),
    },
    organization: {
      findFirst: jest.fn(),
    },
  },
  prisma: {
    botConfig: { findFirst: jest.fn() },
    conversation: { findFirst: jest.fn() },
    message: { findMany: jest.fn() },
  },
}), { virtual: true });

jest.mock("../../src/services/secuenceService", () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(1),
}));

const mockedBasePrisma = basePrisma as unknown as {
  counter: { findFirst: jest.Mock };
  organization: { findFirst: jest.Mock };
};

const mockGroqResponse = (content: string, toolCalls?: any) =>
  Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve({
        choices: [
          {
            message: {
              content,
              ...(toolCalls ? { tool_calls: toolCalls } : {}),
            },
          },
        ],
      }),
  });

const mockGroqError = (status: number, detail: string) =>
  Promise.resolve({
    ok: false,
    status,
    text: () => Promise.resolve(detail),
  });

const mockOrg: any = {
  id: "org-1",
  name: "Test Comercio",
  plan: "PREMIUM",
};

const mockBotConfig: any = {
  id: "bot-1",
  organizationId: "org-1",
  enabled: true,
  knowledgeBase: "Info del comercio",
  model: "llama-3.1-8b-instant",
  apiKey: "test-key" as string | null,
  dailyLimit: 200,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockMessages: Message[] = [
  {
    id: "m1",
    conversationId: "c1",
    sender: "GUEST",
    senderUserId: null,
    isBot: false,
    body: "Hola, tengo una consulta",
    readAt: null,
    createdAt: new Date(),
  },
];

describe("botService — vendorMode & RAG", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("vendorMode (T5)", () => {
    it("usa prompt orientado a ventas en vendorMode", async () => {
      (global as any).fetch.mockResolvedValue(
        mockGroqResponse("Tenemos croquetas premium"),
      );

      await generateBotReply({
        botConfig: mockBotConfig,
        org: mockOrg,
        messages: mockMessages,
        vendorMode: true,
      });

      const options = (global as any).fetch.mock.calls[0][1];
      const body = JSON.parse(options.body);

      expect(body.messages[0].content).toContain("asistente de ventas");
      expect(body.messages[0].content).toContain("orientado a cerrar ventas");
      expect(body.messages[0].content).toContain("PRECIO");
      expect(body.messages[0].content).toContain("STOCK");
    });

    it("NO incluye BASE DE CONOCIMIENTO en vendorMode", async () => {
      (global as any).fetch.mockResolvedValue(
        mockGroqResponse("respuesta"),
      );

      await generateBotReply({
        botConfig: mockBotConfig,
        org: mockOrg,
        messages: mockMessages,
        vendorMode: true,
      });

      const options = (global as any).fetch.mock.calls[0][1];
      const body = JSON.parse(options.body);

      expect(body.messages[0].content).not.toContain("BASE DE CONOCIMIENTO");
    });
  });

  describe("vendorMode — HANDOFF_TOOL excluded (T5)", () => {
    it("excluye HANDOFF_TOOL en vendorMode", async () => {
      (global as any).fetch.mockResolvedValue(
        mockGroqResponse("respuesta"),
      );

      await generateBotReply({
        botConfig: mockBotConfig,
        org: mockOrg,
        messages: mockMessages,
        vendorMode: true,
      });

      const options = (global as any).fetch.mock.calls[0][1];
      const body = JSON.parse(options.body);

      expect(body.tools).toBeUndefined();
      expect(body.tool_choice).toBeUndefined();
    });

    it("incluye HANDOFF_TOOL en modo normal", async () => {
      (global as any).fetch.mockResolvedValue(
        mockGroqResponse("respuesta"),
      );

      await generateBotReply({
        botConfig: mockBotConfig,
        org: mockOrg,
        messages: mockMessages,
      });

      const options = (global as any).fetch.mock.calls[0][1];
      const body = JSON.parse(options.body);

      expect(body.tools).toBeDefined();
      expect(body.tools[0].function.name).toBe("request_human_handoff");
    });
  });

  describe("RAG injection (T6)", () => {
    it("inyecta ragContext en el system prompt", async () => {
      (global as any).fetch.mockResolvedValue(
        mockGroqResponse("respuesta con productos"),
      );

      const ragContext =
        "Productos relevantes:\n• Croquetas $45000 | Stock: 30";

      await generateBotReply({
        botConfig: mockBotConfig,
        org: mockOrg,
        messages: mockMessages,
        vendorMode: true,
        ragContext,
      });

      const options = (global as any).fetch.mock.calls[0][1];
      const body = JSON.parse(options.body);

      expect(body.messages[0].content).toContain("PRODUCTOS RELEVANTES");
      expect(body.messages[0].content).toContain(ragContext);
    });

    it("sin ragContext en modo normal — solo KB", async () => {
      (global as any).fetch.mockResolvedValue(
        mockGroqResponse("respuesta normal"),
      );

      await generateBotReply({
        botConfig: mockBotConfig,
        org: mockOrg,
        messages: mockMessages,
      });

      const options = (global as any).fetch.mock.calls[0][1];
      const body = JSON.parse(options.body);

      expect(body.messages[0].content).toContain("BASE DE CONOCIMIENTO");
      expect(body.messages[0].content).not.toContain("PRODUCTOS RELEVANTES");
    });

    it("pasar historial de mensajes a Groq", async () => {
      (global as any).fetch.mockResolvedValue(
        mockGroqResponse("respuesta"),
      );

      await generateBotReply({
        botConfig: mockBotConfig,
        org: mockOrg,
        messages: mockMessages,
      });

      const options = (global as any).fetch.mock.calls[0][1];
      const body = JSON.parse(options.body);

      expect(body.messages).toHaveLength(2);
      expect(body.messages[1].role).toBe("user");
      expect(body.messages[1].content).toBe("Hola, tengo una consulta");
    });
  });

  describe("tipos de retorno", () => {
    it("devuelve text cuando Groq responde texto", async () => {
      (global as any).fetch.mockResolvedValue(
        mockGroqResponse("Tenemos stock disponible"),
      );

      const result = await generateBotReply({
        botConfig: mockBotConfig,
        org: mockOrg,
        messages: mockMessages,
      });

      expect(result).toEqual({
        kind: "text",
        content: "Tenemos stock disponible",
      });
    });

    it("devuelve null sin API key", async () => {
      const originalEnv = process.env.GROQ_API_KEY;
      delete (process.env as any).GROQ_API_KEY;

      const result = await generateBotReply({
        botConfig: { ...mockBotConfig, apiKey: null },
        org: mockOrg,
        messages: mockMessages,
      });

      expect(result).toBeNull();
      (process.env as any).GROQ_API_KEY = originalEnv;
    });

    it("devuelve null cuando Groq falla", async () => {
      (global as any).fetch.mockResolvedValue(
        mockGroqError(500, "Internal Error"),
      );

      const result = await generateBotReply({
        botConfig: mockBotConfig,
        org: mockOrg,
        messages: mockMessages,
      });

      expect(result).toBeNull();
    });
  });
});

describe("botService — counters separados (T5)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("getVendorChatUsageToday usa counter vendor-chat:${date}", async () => {
    mockedBasePrisma.counter.findFirst.mockResolvedValue({
      sequenceValue: 5,
    });

    const result = await getVendorChatUsageToday("org-1");

    expect(mockedBasePrisma.counter.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: "org-1",
        name: `vendor-chat:${new Date().toISOString().slice(0, 10)}`,
      },
      select: { sequenceValue: true },
    });
    expect(result).toBe(5);
  });

  it("incrementVendorChatUsage usa counter vendor-chat:${date}", async () => {
    jest.mocked(seqService.default).mockResolvedValue(1);

    await incrementVendorChatUsage("org-1");

    expect(seqService.default).toHaveBeenCalledWith(
      "org-1",
      expect.stringContaining("vendor-chat:"),
    );
  });
});

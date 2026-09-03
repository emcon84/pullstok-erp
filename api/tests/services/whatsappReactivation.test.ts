import {
  reactivateIdleWhatsappConversations,
  INACTIVITY_MINUTES_DEFAULT,
  startWhatsappReactivationScheduler,
} from "../../src/services/whatsappReactivation";

// El job usa basePrisma (SIN scope de tenant, porque corre sin contexto de org).
// Lo mockeamos para no cargar Prisma ni intentar conectar a la DB en el unit
// test. Mismo espíritu que whatsappService.test.ts (mockea `../config/db`).
jest.mock("../../src/config/db", () => ({
  prisma: {},
  basePrisma: {
    conversation: {
      updateMany: jest.fn(),
    },
  },
}));

import { basePrisma } from "../../src/config/db";

const mockUpdateMany = basePrisma.conversation.updateMany as jest.Mock;

describe("whatsappReactivation", () => {
  beforeEach(() => {
    mockUpdateMany.mockReset();
  });

  describe("reactivateIdleWhatsappConversations", () => {
    it("llama a updateMany con el where correcto (WHATSAPP + HUMAN + lastMessageAt < cutoff)", async () => {
      const now = new Date("2026-09-03T12:00:00Z");
      const inactivityMinutes = 10;
      mockUpdateMany.mockResolvedValue({ count: 3 });

      const count = await reactivateIdleWhatsappConversations({
        inactivityMinutes,
        now,
      });

      // Devuelve el count que retorna el mock.
      expect(count).toBe(3);

      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: {
          channel: "WHATSAPP",
          mode: "HUMAN",
          lastMessageAt: {
            not: null,
            lt: new Date(now.getTime() - inactivityMinutes * 60_000),
          },
        },
        data: {
          mode: "BOT",
          whatsappStage: null,
        },
      });
    });

    it("con now por defecto también funciona (no lanza) y usa el count del mock", async () => {
      mockUpdateMany.mockResolvedValue({ count: 5 });

      await expect(reactivateIdleWhatsappConversations()).resolves.toBe(5);
      expect(mockUpdateMany).toHaveBeenCalledTimes(1);

      // Sin pasar minutos, el cutoff se calcula con el default (env o 10).
      const args = mockUpdateMany.mock.calls[0][0];
      expect(args.where.mode).toBe("HUMAN");
      expect(args.where.channel).toBe("WHATSAPP");
      expect(args.where.lastMessageAt.lt).toBeInstanceOf(Date);
    });
  });

  describe("startWhatsappReactivationScheduler", () => {
    it("devuelve un handle de setInterval que se puede limpiar", () => {
      const handle = startWhatsappReactivationScheduler();
      expect(handle).toBeDefined();
      clearInterval(handle);
    });
  });
});

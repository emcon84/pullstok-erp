import { createHmac } from "crypto";
import {
  normalizePhone,
  verifyWebhookSignature,
} from "../../src/services/whatsappService";

// Las funciones puras que testeamos no tocan DB; mockeamos los módulos pesados
// (db / tenantContext / chatService) para que el import no cargue Prisma ni el
// socket. Mismo espíritu que authService.test.ts (mockea `../config/db`).
jest.mock("../../src/config/db", () => ({
  prisma: {},
  basePrisma: {},
}));

jest.mock("../../src/config/tenantContext", () => ({
  runWithTenant: jest.fn(),
  requireOrganizationId: jest.fn(),
}));

jest.mock("../../src/services/chatService", () => ({
  persistMessage: jest.fn(),
}));

describe("whatsappService", () => {
  describe("normalizePhone", () => {
    it('"+56 9 2040 3095" -> "56920403095"', () => {
      expect(normalizePhone("+56 9 2040 3095")).toBe("56920403095");
    });

    it('"543482445015" -> "543482445015"', () => {
      expect(normalizePhone("543482445015")).toBe("543482445015");
    });

    it('"  +1 (234) 567-8900 " -> "12345678900"', () => {
      expect(normalizePhone("  +1 (234) 567-8900 ")).toBe("12345678900");
    });

    it('"" -> null', () => {
      expect(normalizePhone("")).toBeNull();
    });

    it("undefined -> null", () => {
      expect(normalizePhone(undefined)).toBeNull();
    });

    it("null -> null", () => {
      expect(normalizePhone(null)).toBeNull();
    });
  });

  describe("verifyWebhookSignature", () => {
    const secret = "test-secret";
    const body = Buffer.from('{"hello":"world"}', "utf8");

    it("devuelve true con la firma correcta", () => {
      const sig = createHmac("sha256", secret).update(body).digest("hex");
      expect(verifyWebhookSignature(body, sig, secret)).toBe(true);
    });

    it("devuelve false con una firma distinta", () => {
      const wrong = createHmac("sha256", secret)
        .update(Buffer.from("otro-body", "utf8"))
        .digest("hex");
      expect(verifyWebhookSignature(body, wrong, secret)).toBe(false);
    });

    it("devuelve false con signature undefined", () => {
      expect(verifyWebhookSignature(body, undefined, secret)).toBe(false);
    });

    it("no lanza con buffers de distinta longitud (RangeError guardado)", () => {
      const shortSig = "a1b2c3";
      expect(() => verifyWebhookSignature(body, shortSig, secret)).not.toThrow();
      expect(verifyWebhookSignature(body, shortSig, secret)).toBe(false);
    });
  });
});

import { createHmac } from "crypto";
import {
  normalizePhone,
  verifyWebhookSignature,
  isCatalogQuery,
  buildOrderSummary,
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

  describe("isCatalogQuery (FASE 4)", () => {
    it("detecta consultas de producto", () => {
      expect(isCatalogQuery("¿para qué sirve el Pro Plan?")).toBe(true);
      expect(isCatalogQuery("qué me recomendas para cachorros")).toBe(true);
      expect(isCatalogQuery("ayudame a elegir un alimento")).toBe(true);
      expect(isCatalogQuery("cuánto sale el royal canin")).toBe(true);
    });

    it("NO trata como consulta los ids del flujo guiado (botones)", () => {
      expect(isCatalogQuery("perro")).toBe(false);
      expect(isCatalogQuery("gato")).toBe(false);
      expect(isCatalogQuery("t-adulto")).toBe(false);
      expect(isCatalogQuery("b-proplan")).toBe(false);
      expect(isCatalogQuery("NEED_MORE")).toBe(false);
      expect(isCatalogQuery("45")).toBe(false);
      expect(isCatalogQuery("ok")).toBe(false);
    });
  });

  describe("buildOrderSummary (Punto 2)", () => {
    it("arma el resumen con ítem sin match compuesto por marca/especie/etapa/peso", () => {
      const items = [
        {
          productId: null,
          productName: null,
          type: "bolsa",
          quantity: 1,
          amount: null,
          detail: null,
          total: null,
          marca: "KONGO",
          especie: "Perro",
          etapa: "Adulto",
          peso: "20 kg",
        },
        {
          productId: null,
          productName: null,
          type: "bolsa",
          quantity: 2,
          amount: null,
          detail: null,
          total: null,
          marca: "Gati",
          especie: "Gato",
          etapa: "Kitten",
          peso: "2 kg",
        },
      ];
      expect(buildOrderSummary(items)).toBe(
        "🛒 Resumen de tu pedido:\n1. KONGO · Perro · Adulto · 20 kg x1\n2. Gati · Gato · Kitten · 2 kg x2",
      );
    });

    it("usa productName y la unidad de detail cuando hay match", () => {
      const items = [
        {
          productId: "p1",
          productName: "KONGO 15kg Adulto",
          type: "bolsa",
          quantity: 1,
          amount: null,
          detail: "x1 15 kg",
          total: 45000,
          marca: "KONGO",
          especie: "Perro",
          etapa: "Adulto",
          peso: "15 kg",
        },
      ];
      expect(buildOrderSummary(items)).toBe(
        "🛒 Resumen de tu pedido:\n1. KONGO 15kg Adulto x1 = $45000",
      );
    });

    it("usa el importe ($) para la rama por monto", () => {
      const items = [
        {
          productId: null,
          productName: null,
          type: "monto",
          quantity: null,
          amount: 15000,
          detail: null,
          total: 15000,
          marca: null,
          especie: "Perro",
          etapa: "Adulto",
          peso: null,
        },
      ];
      expect(buildOrderSummary(items)).toBe(
        "🛒 Resumen de tu pedido:\n1. Perro · Adulto $15000",
      );
    });

    it("cae a 'Producto' cuando no hay nombre ni atributos en un ítem vacío", () => {
      const items = [{ productId: null, productName: null }];
      expect(buildOrderSummary(items)).toBe(
        "🛒 Resumen de tu pedido:\n1. Producto",
      );
    });
  });
});

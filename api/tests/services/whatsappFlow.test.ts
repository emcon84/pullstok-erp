// FASE 2 — test del motor de flujo guiado (máquina de estados).
//
// whatsappFlow es PURO (sin I/O, sin DB) → no hace falta mockear nada. Se cubre
// planResponse (el orquestador de decisión) y nextStageForAnswer en todos los
// ramos del árbol: START→TYPE, START→CONSULTA, TYPE→los 4 tipos, PRODUCT→ADDRESS,
// ADDRESS→PAYMENT, PAYMENT→los 3 pagos, PAYMENT→QR, terminales y primer contacto.

import {
  planResponse,
  nextStageForAnswer,
  messageForStage,
  buttonsForStage,
  isTerminalStage,
  isHandoffStage,
  shouldEscalate,
  buildDraftData,
  mergeDraftData,
  normalizeOrderType,
  normalizePaymentMethod,
  STAGE_START,
  STAGE_CONSULTA,
  STAGE_TYPE,
  STAGE_PRODUCT,
  STAGE_AMOUNT,
  STAGE_PROD_AMOUNT,
  STAGE_ADDRESS,
  STAGE_PAYMENT,
  STAGE_QR,
  STAGE_OTHER,
  STAGE_DONE,
  STAGE_PAYMENT_DONE,
  BUTTON_PEDIDO,
  BUTTON_CONSULTA,
  BUTTON_BOLSA,
  BUTTON_KILO,
  BUTTON_MONTO,
  BUTTON_OTRO,
  BUTTON_QR,
  BUTTON_TRANSFERENCIA,
  BUTTON_EFECTIVO,
} from "../../src/services/whatsappFlow";

describe("whatsappFlow — nextStageForAnswer", () => {
  it("START + ACTION_ORDER → TYPE", () => {
    expect(nextStageForAnswer(STAGE_START, BUTTON_PEDIDO.id)).toBe(STAGE_TYPE);
  });

  it("START + ACTION_CONSULT → CONSULTA", () => {
    expect(nextStageForAnswer(STAGE_START, BUTTON_CONSULTA.id)).toBe(STAGE_CONSULTA);
  });

  it("START + texto 'quiero un pedido' → TYPE", () => {
    expect(nextStageForAnswer(STAGE_START, "quiero un pedido de alimento")).toBe(
      STAGE_TYPE,
    );
  });

  it("START + texto de consulta genérico → CONSULTA", () => {
    expect(nextStageForAnswer(STAGE_START, "qué horario tienen?")).toBe(
      STAGE_CONSULTA,
    );
  });

  it("TYPE + TYPE_BAG → PRODUCT", () => {
    expect(nextStageForAnswer(STAGE_TYPE, BUTTON_BOLSA.id)).toBe(STAGE_PRODUCT);
  });

  it("TYPE + '1' (bolsa) → PRODUCT", () => {
    expect(nextStageForAnswer(STAGE_TYPE, "1")).toBe(STAGE_PRODUCT);
  });

  it("TYPE + 'bolsa' (texto libre) → PRODUCT", () => {
    expect(nextStageForAnswer(STAGE_TYPE, "bolsa")).toBe(STAGE_PRODUCT);
  });

  it("TYPE + TYPE_KILO → PRODUCT", () => {
    expect(nextStageForAnswer(STAGE_TYPE, BUTTON_KILO.id)).toBe(STAGE_PRODUCT);
  });

  it("TYPE + '2' (kilo) → PRODUCT", () => {
    expect(nextStageForAnswer(STAGE_TYPE, "2")).toBe(STAGE_PRODUCT);
  });

  it("TYPE + TYPE_MONTO → PRODUCT", () => {
    expect(nextStageForAnswer(STAGE_TYPE, BUTTON_MONTO.id)).toBe(STAGE_PRODUCT);
  });

  it("TYPE + TYPE_OTHER → OTHER", () => {
    expect(nextStageForAnswer(STAGE_TYPE, BUTTON_OTRO.id)).toBe(STAGE_OTHER);
  });

  it("TYPE + '4' (otro) → OTHER", () => {
    expect(nextStageForAnswer(STAGE_TYPE, "4")).toBe(STAGE_OTHER);
  });

  it("PRODUCT (texto libre) → ADDRESS", () => {
    expect(nextStageForAnswer(STAGE_PRODUCT, "Royal Canin")).toBe(STAGE_ADDRESS);
  });

  it("AMOUNT → ADDRESS (rama sin cálculo, FASE 3)", () => {
    expect(nextStageForAnswer(STAGE_AMOUNT, "50000")).toBe(STAGE_ADDRESS);
  });

  it("PROD_AMOUNT → ADDRESS", () => {
    expect(nextStageForAnswer(STAGE_PROD_AMOUNT, "2 kilos")).toBe(STAGE_ADDRESS);
  });

  it("ADDRESS → PAYMENT", () => {
    expect(nextStageForAnswer(STAGE_ADDRESS, "San Martín 123, San Justo")).toBe(
      STAGE_PAYMENT,
    );
  });

  it("PAYMENT + PAY_QR → QR", () => {
    expect(nextStageForAnswer(STAGE_PAYMENT, BUTTON_QR.id)).toBe(STAGE_QR);
  });

  it("PAYMENT + PAY_TRANSFER → PAYMENT_DONE", () => {
    expect(nextStageForAnswer(STAGE_PAYMENT, BUTTON_TRANSFERENCIA.id)).toBe(
      STAGE_PAYMENT_DONE,
    );
  });

  it("PAYMENT + PAY_CASH → PAYMENT_DONE", () => {
    expect(nextStageForAnswer(STAGE_PAYMENT, BUTTON_EFECTIVO.id)).toBe(
      STAGE_PAYMENT_DONE,
    );
  });

  it("PAYMENT + 'transferencia' (texto) → PAYMENT_DONE", () => {
    expect(nextStageForAnswer(STAGE_PAYMENT, "por transferencia")).toBe(
      STAGE_PAYMENT_DONE,
    );
  });

  it("QR → PAYMENT_DONE (cierra con la respuesta siguiente)", () => {
    expect(nextStageForAnswer(STAGE_QR, "ya está, listo")).toBe(STAGE_PAYMENT_DONE);
  });

  it("CONSULTA → DONE (terminal)", () => {
    expect(nextStageForAnswer(STAGE_CONSULTA, "gracias")).toBe(STAGE_DONE);
  });

  it("OTHER → DONE (terminal)", () => {
    expect(nextStageForAnswer(STAGE_OTHER, "nada más")).toBe(STAGE_DONE);
  });
});

describe("whatsappFlow — planResponse", () => {
  it("primer contacto (currentStage null) → START con botones, sin imagen", () => {
    const r = planResponse({ currentStage: null, answer: "hola" });
    expect(r.nextStage).toBe(STAGE_START);
    expect(r.message).toBe(messageForStage(STAGE_START));
    expect(r.buttons).toEqual([BUTTON_PEDIDO, BUTTON_CONSULTA]);
    expect(r.sendImage).toBe(false);
  });

  it("START + pedido → TYPE (sin botones, texto numerado)", () => {
    const r = planResponse({ currentStage: STAGE_START, answer: BUTTON_PEDIDO.id });
    expect(r.nextStage).toBe(STAGE_TYPE);
    expect(r.buttons).toBeNull();
    expect(r.sendImage).toBe(false);
  });

  it("START + consulta → CONSULTA (handoff a humano)", () => {
    const r = planResponse({ currentStage: STAGE_START, answer: BUTTON_CONSULTA.id });
    expect(r.nextStage).toBe(STAGE_CONSULTA);
    expect(isHandoffStage(r.nextStage)).toBe(true);
  });

  it("TYPE + '1' → PRODUCT", () => {
    const r = planResponse({ currentStage: STAGE_TYPE, answer: "1" });
    expect(r.nextStage).toBe(STAGE_PRODUCT);
  });

  it("PRODUCT → ADDRESS", () => {
    const r = planResponse({ currentStage: STAGE_PRODUCT, answer: "Royal Canin" });
    expect(r.nextStage).toBe(STAGE_ADDRESS);
  });

  it("ADDRESS → PAYMENT con botones QR/transferencia/efectivo", () => {
    const r = planResponse({ currentStage: STAGE_ADDRESS, answer: "San Martín 123" });
    expect(r.nextStage).toBe(STAGE_PAYMENT);
    expect(r.buttons).toEqual([
      BUTTON_QR,
      BUTTON_TRANSFERENCIA,
      BUTTON_EFECTIVO,
    ]);
  });

  it("PAYMENT + QR con qrImageUrl → STAGE_QR y envía imagen", () => {
    const r = planResponse({
      currentStage: STAGE_PAYMENT,
      answer: BUTTON_QR.id,
      qrImageUrl: "https://cdn.example.com/qr.png",
    });
    expect(r.nextStage).toBe(STAGE_QR);
    expect(r.sendImage).toBe(true);
    expect(r.buttons).toBeNull();
  });

  it("PAYMENT + QR sin qrImageUrl → STAGE_QR y manda texto (sin imagen)", () => {
    const r = planResponse({ currentStage: STAGE_PAYMENT, answer: BUTTON_QR.id });
    expect(r.nextStage).toBe(STAGE_QR);
    expect(r.sendImage).toBe(false);
  });

  it("PAYMENT + transferencia → PAYMENT_DONE (terminal, sin botones)", () => {
    const r = planResponse({ currentStage: STAGE_PAYMENT, answer: BUTTON_TRANSFERENCIA.id });
    expect(r.nextStage).toBe(STAGE_PAYMENT_DONE);
    expect(isTerminalStage(r.nextStage)).toBe(true);
    expect(r.buttons).toBeNull();
  });

  it("QR → PAYMENT_DONE (terminal)", () => {
    const r = planResponse({ currentStage: STAGE_QR, answer: "listo" });
    expect(r.nextStage).toBe(STAGE_PAYMENT_DONE);
    expect(isTerminalStage(r.nextStage)).toBe(true);
  });
});

describe("whatsappFlow — helpers", () => {
  it("isTerminalStage", () => {
    expect(isTerminalStage(STAGE_DONE)).toBe(true);
    expect(isTerminalStage(STAGE_PAYMENT_DONE)).toBe(true);
    expect(isTerminalStage(STAGE_PRODUCT)).toBe(false);
    expect(isTerminalStage(STAGE_PAYMENT)).toBe(false);
  });

  it("isHandoffStage", () => {
    expect(isHandoffStage(STAGE_CONSULTA)).toBe(true);
    expect(isHandoffStage(STAGE_OTHER)).toBe(true);
    expect(isHandoffStage(STAGE_PAYMENT)).toBe(false);
  });

  it("shouldEscalate cubre terminales + handoff", () => {
    expect(shouldEscalate(STAGE_DONE)).toBe(true);
    expect(shouldEscalate(STAGE_PAYMENT_DONE)).toBe(true);
    expect(shouldEscalate(STAGE_CONSULTA)).toBe(true);
    expect(shouldEscalate(STAGE_OTHER)).toBe(true);
    expect(shouldEscalate(STAGE_PRODUCT)).toBe(false);
  });

  it("buttonsForStage devuelve null en nodos que esperan texto (incluye TYPE)", () => {
    expect(buttonsForStage(STAGE_PRODUCT)).toBeNull();
    expect(buttonsForStage(STAGE_ADDRESS)).toBeNull();
    expect(buttonsForStage(STAGE_QR)).toBeNull();
    expect(buttonsForStage(STAGE_TYPE)).toBeNull();
  });
});

describe("whatsappFlow — buildDraftData (FASE 3)", () => {
  it("TYPE + botón bolsa → orderType 'bolsa'", () => {
    expect(buildDraftData(STAGE_TYPE, BUTTON_BOLSA.id)).toEqual({
      orderType: "bolsa",
    });
  });

  it("TYPE + número '2' → orderType 'kilo'", () => {
    expect(buildDraftData(STAGE_TYPE, "2")).toEqual({ orderType: "kilo" });
  });

  it("TYPE + texto 'monto' → orderType 'monto'", () => {
    expect(buildDraftData(STAGE_TYPE, "monto")).toEqual({ orderType: "monto" });
  });

  it("TYPE + botón otro → orderType 'otro'", () => {
    expect(buildDraftData(STAGE_TYPE, BUTTON_OTRO.id)).toEqual({
      orderType: "otro",
    });
  });

  it("PRODUCT (texto libre) → productText", () => {
    expect(buildDraftData(STAGE_PRODUCT, "Royal Canin 15kg")).toEqual({
      productText: "royal canin 15kg",
    });
  });

  it("ADDRESS → address", () => {
    expect(buildDraftData(STAGE_ADDRESS, "San Martín 123, San Justo")).toEqual({
      address: "san martín 123, san justo",
    });
  });

  it("PAYMENT + QR → paymentMethod 'qr'", () => {
    expect(buildDraftData(STAGE_PAYMENT, BUTTON_QR.id)).toEqual({
      paymentMethod: "qr",
    });
  });

  it("PAYMENT + transferencia → paymentMethod 'transferencia'", () => {
    expect(buildDraftData(STAGE_PAYMENT, BUTTON_TRANSFERENCIA.id)).toEqual({
      paymentMethod: "transferencia",
    });
  });

  it("PAYMENT + efectivo (texto) → paymentMethod 'efectivo'", () => {
    expect(buildDraftData(STAGE_PAYMENT, "en efectivo")).toEqual({
      paymentMethod: "efectivo",
    });
  });

  it("nodos informativos (START / QR / terminales) devuelven {} (sin dato)", () => {
    expect(buildDraftData(STAGE_START, "hola")).toEqual({});
    expect(buildDraftData(STAGE_QR, "ya está")).toEqual({});
    expect(buildDraftData(STAGE_DONE, "gracias")).toEqual({});
    expect(buildDraftData(null, "hola")).toEqual({});
  });

  it("AMOUNT (rama por monto, FASE 4) captura el importe en amount", () => {
    expect(buildDraftData(STAGE_AMOUNT, "50000")).toEqual({ amount: 50000 });
  });
});

describe("whatsappFlow — mergeDraftData (FASE 3)", () => {
  it("mergea patch sobre existing y deja intactos los datos previos", () => {
    const existing = { orderType: "bolsa", productText: "royal canin" };
    const merged = mergeDraftData(existing, { address: "san martín 123" });
    expect(merged).toEqual({
      orderType: "bolsa",
      productText: "royal canin",
      address: "san martín 123",
    });
  });

  it("existing null → solo el patch", () => {
    expect(mergeDraftData(null, { paymentMethod: "qr" })).toEqual({
      paymentMethod: "qr",
    });
  });

  it("el patch pisa datos previos del mismo campo (corrección del cliente)", () => {
    const merged = mergeDraftData(
      { address: "av. 1" },
      { address: "calle 2" },
    );
    expect(merged.address).toBe("calle 2");
  });
});

describe("whatsappFlow — normalize helpers (FASE 3)", () => {
  it("normalizeOrderType cubre id, número y palabra", () => {
    expect(normalizeOrderType(BUTTON_BOLSA.id)).toBe("bolsa");
    expect(normalizeOrderType("3")).toBe("monto");
    expect(normalizeOrderType("kilo")).toBe("kilo");
    expect(normalizeOrderType("otro")).toBe("otro");
    expect(normalizeOrderType("no sé")).toBeNull();
  });

  it("normalizePaymentMethod cubre id y palabra", () => {
    expect(normalizePaymentMethod(BUTTON_QR.id)).toBe("qr");
    expect(normalizePaymentMethod("transferencia")).toBe("transferencia");
    expect(normalizePaymentMethod("efectivo")).toBe("efectivo");
    expect(normalizePaymentMethod("débito")).toBeNull();
  });
});

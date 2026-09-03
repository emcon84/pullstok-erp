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
  isRestartIntent,
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
  STAGE_SPECIES,
  STAGE_TYPED,
  STAGE_BRAND,
  STAGE_PRODUCT_SELECT,
  STAGE_PRODUCT_QUANTITY,
  STAGE_PRODUCT_AMOUNT,
  STAGE_NEED_MORE,
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
  BUTTON_MORE,
  BUTTON_DONE_MORE,
  type FlowCatalog,
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
    expect(nextStageForAnswer(STAGE_TYPE, BUTTON_BOLSA.id)).toBe(STAGE_SPECIES);
  });

  it("TYPE + '1' (bolsa) → PRODUCT", () => {
    expect(nextStageForAnswer(STAGE_TYPE, "1")).toBe(STAGE_SPECIES);
  });

  it("TYPE + 'bolsa' (texto libre) → PRODUCT", () => {
    expect(nextStageForAnswer(STAGE_TYPE, "bolsa")).toBe(STAGE_SPECIES);
  });

  it("TYPE + TYPE_KILO → PRODUCT", () => {
    expect(nextStageForAnswer(STAGE_TYPE, BUTTON_KILO.id)).toBe(STAGE_SPECIES);
  });

  it("TYPE + '2' (kilo) → PRODUCT", () => {
    expect(nextStageForAnswer(STAGE_TYPE, "2")).toBe(STAGE_SPECIES);
  });

  it("TYPE + TYPE_MONTO → PRODUCT", () => {
    expect(nextStageForAnswer(STAGE_TYPE, BUTTON_MONTO.id)).toBe(STAGE_SPECIES);
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
    expect(r.nextStage).toBe(STAGE_SPECIES);
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

  it("isRestartIntent detecta palabras de reinicio", () => {
    expect(isRestartIntent("hola")).toBe(true);
    expect(isRestartIntent("Hola!")).toBe(true);
    expect(isRestartIntent("empezar")).toBe(true);
    expect(isRestartIntent("cancelar")).toBe(true);
    expect(isRestartIntent("quiero hacer otro pedido")).toBe(true);
    expect(isRestartIntent("quiero cambiar el pedido")).toBe(true);
    expect(isRestartIntent("quiero proplan de 15kg")).toBe(false);
    expect(isRestartIntent("old prince")).toBe(false);
    expect(isRestartIntent("")).toBe(false);
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

describe("whatsappFlow — flujo guiado FASE 4 (especie→etapa→marca→producto)", () => {
  it("SPECIES → STAGE", () => {
    expect(nextStageForAnswer(STAGE_SPECIES, "perro")).toBe(STAGE_TYPED);
  });

  it("STAGE → BRAND", () => {
    expect(nextStageForAnswer(STAGE_TYPED, "tipo-uuid")).toBe(STAGE_BRAND);
  });

  it("BRAND → PRODUCT_SELECT", () => {
    expect(nextStageForAnswer(STAGE_BRAND, "marca-uuid")).toBe(STAGE_PRODUCT_SELECT);
  });

  it("PRODUCT_SELECT → QUANTITY cuando orderType es bolsa/kilo", () => {
    expect(
      nextStageForAnswer(STAGE_PRODUCT_SELECT, "prod-uuid", { orderType: "bolsa" }),
    ).toBe(STAGE_PRODUCT_QUANTITY);
  });

  it("PRODUCT_SELECT → AMOUNT cuando orderType es monto", () => {
    expect(
      nextStageForAnswer(STAGE_PRODUCT_SELECT, "prod-uuid", { orderType: "monto" }),
    ).toBe(STAGE_PRODUCT_AMOUNT);
  });

  it("PRODUCT_SELECT → QUANTITY por default (sin orderType)", () => {
    expect(nextStageForAnswer(STAGE_PRODUCT_SELECT, "prod-uuid")).toBe(
      STAGE_PRODUCT_QUANTITY,
    );
  });

  it("QUANTITY → NEED_MORE (tras confirmar cantidad)", () => {
    expect(nextStageForAnswer(STAGE_PRODUCT_QUANTITY, "2")).toBe(STAGE_NEED_MORE);
  });

  it("AMOUNT → NEED_MORE (tras confirmar importe)", () => {
    expect(nextStageForAnswer(STAGE_PRODUCT_AMOUNT, "15000")).toBe(STAGE_NEED_MORE);
  });

  it("NEED_MORE + 'sí' → SPECIES (agregar otra línea)", () => {
    expect(nextStageForAnswer(STAGE_NEED_MORE, "sí, otro")).toBe(STAGE_SPECIES);
  });

  it("NEED_MORE + 'no' → ADDRESS (terminar)", () => {
    expect(nextStageForAnswer(STAGE_NEED_MORE, "no, está todo")).toBe(STAGE_ADDRESS);
  });

  it("NEED_MORE sin palabra 'sí/no' → ADDRESS por default", () => {
    expect(nextStageForAnswer(STAGE_NEED_MORE, "messi")).toBe(STAGE_ADDRESS);
  });

  it("ADDRESS → PAYMENT se mantiene", () => {
    expect(nextStageForAnswer(STAGE_ADDRESS, "San Martín 123")).toBe(STAGE_PAYMENT);
  });
});

describe("whatsappFlow — menús con catálogo (FASE 4)", () => {
  const catalog: FlowCatalog = {
    species: ["perro", "gato"],
    stages: [
      { stage: "Adulto", id: "t-adulto" },
      { stage: "Cachorro", id: "t-cachorro" },
    ],
    brands: [{ brand: "Pro Plan", id: "b-proplan" }],
    products: [
      {
        type: "bolsa",
        id: "p-1",
        label: "Pro Plan Cachorro 15kg",
        price: 45000,
        priceKg: null,
      },
      {
        type: "kilo",
        id: "c-1",
        label: "Pro Plan Cachorro suelto",
        price: 30000,
        priceKg: 30000,
      },
    ],
  };

  it("buttonsForStage(SPECIES, catalog) genera botones de especie", () => {
    expect(buttonsForStage(STAGE_SPECIES, catalog)).toEqual([
      { id: "perro", title: "🐶 Perro" },
      { id: "gato", title: "🐱 Gato" },
    ]);
  });

  it("buttonsForStage(STAGE, catalog) filtra por las especies listadas", () => {
    const gatoOnly = { ...catalog, species: ["gato"] };
    expect(buttonsForStage(STAGE_SPECIES, gatoOnly)).toEqual([
      { id: "gato", title: "🐱 Gato" },
    ]);
  });

  it("buttonsForStage(TYPED, catalog) mapea las etapas", () => {
    expect(buttonsForStage(STAGE_TYPED, catalog)).toEqual([
      { id: "t-adulto", title: "Adulto" },
      { id: "t-cachorro", title: "Cachorro" },
    ]);
  });

  it("buttonsForStage(BRAND, catalog) mapea las marcas", () => {
    expect(buttonsForStage(STAGE_BRAND, catalog)).toEqual([
      { id: "b-proplan", title: "Pro Plan" },
    ]);
  });

  it("buttonsForStage(PRODUCT_SELECT, catalog) mapea los productos (títulos recortados)", () => {
    expect(buttonsForStage(STAGE_PRODUCT_SELECT, catalog)).toEqual([
      { id: "p-1", title: "Pro Plan Cachorro 15kg" },
      { id: "c-1", title: "Pro Plan Cachorro suelto" },
    ]);
  });

  it("buttonsForStage(NEED_MORE, catalog) ofrece 'más' y 'terminar' (≤3)", () => {
    expect(buttonsForStage(STAGE_NEED_MORE, catalog)).toEqual([
      BUTTON_MORE,
      BUTTON_DONE_MORE,
    ]);
  });

  it("buttonsForStage devuelve null si hay más de 3 opciones (límite WhatsApp)", () => {
    const manyStages = {
      ...catalog,
      stages: [
        { stage: "A", id: "1" },
        { stage: "B", id: "2" },
        { stage: "C", id: "3" },
        { stage: "D", id: "4" },
      ],
    };
    expect(buttonsForStage(STAGE_TYPED, manyStages)).toBeNull();
  });

  it("buttonsForStage sin catálogo devuelve null en menús (el service debe cargarlo)", () => {
    expect(buttonsForStage(STAGE_TYPED)).toBeNull();
  });

  it("messageForStage(TYPED, catalog) muestra las etapas numeradas", () => {
    const msg = messageForStage(STAGE_TYPED, catalog);
    expect(msg).toContain("Adulto");
    expect(msg).toContain("1️⃣ Adulto");
  });

  it("messageForStage(SPECIES, catalog) muestra las especies numeradas", () => {
    const msg = messageForStage(STAGE_SPECIES, catalog);
    expect(msg).toContain("1️⃣ 🐶 Perro");
    expect(msg).toContain("2️⃣ 🐱 Gato");
  });

  it("planResponse antepone el costo al salir de QUANTITY hacia NEED_MORE", () => {
    const r = planResponse({
      currentStage: STAGE_PRODUCT_QUANTITY,
      answer: "2",
      catalog,
      orderType: "bolsa",
      cost: { total: 90000, detail: "2 × Pro Plan Cachorro 15kg @ $45000 = $90000" },
    });
    expect(r.nextStage).toBe(STAGE_NEED_MORE);
    expect(r.message).toContain("$90000");
    expect(r.message).toContain("¿Necesitás algo más?");
    expect(r.buttons).toEqual([BUTTON_MORE, BUTTON_DONE_MORE]);
  });

  it("planResponse(SPECIES + 'perro') avanza a TYPED con sus botones", () => {
    const r = planResponse({
      currentStage: STAGE_SPECIES,
      answer: "perro",
      catalog,
      orderType: "bolsa",
    });
    expect(r.nextStage).toBe(STAGE_TYPED);
    expect(r.buttons).toEqual([
      { id: "t-adulto", title: "Adulto" },
      { id: "t-cachorro", title: "Cachorro" },
    ]);
  });
});

describe("whatsappFlow — buildDraftData (FASE 4)", () => {
  it("SPECIES + 'perro' → selectedSpecies", () => {
    expect(buildDraftData(STAGE_SPECIES, "perro")).toEqual({ selectedSpecies: "perro" });
  });

  it("SPECIES + botón de gato → selectedSpecies gato", () => {
    expect(buildDraftData(STAGE_SPECIES, "gato")).toEqual({ selectedSpecies: "gato" });
  });

  it("STAGE + id (uuid) → selectedStageId", () => {
    expect(buildDraftData(STAGE_TYPED, "t-adulto")).toEqual({ selectedStageId: "t-adulto" });
  });

  it("STAGE + número → {} (lo resuelve el service con el catálogo)", () => {
    expect(buildDraftData(STAGE_TYPED, "2")).toEqual({});
  });

  it("BRAND + id → selectedBrandId", () => {
    expect(buildDraftData(STAGE_BRAND, "b-proplan")).toEqual({ selectedBrandId: "b-proplan" });
  });

  it("PRODUCT_SELECT no captura nada (el service arma selectedProduct)", () => {
    expect(buildDraftData(STAGE_PRODUCT_SELECT, "p-1")).toEqual({});
  });

  it("PRODUCT_QUANTITY + '2' → quantityKg", () => {
    expect(buildDraftData(STAGE_PRODUCT_QUANTITY, "2")).toEqual({ quantityKg: 2 });
  });

  it("PRODUCT_QUANTITY + '1.5' → quantityKg 1.5", () => {
    expect(buildDraftData(STAGE_PRODUCT_QUANTITY, "1.5")).toEqual({ quantityKg: 1.5 });
  });

  it("PRODUCT_QUANTITY + texto inválido → {}", () => {
    expect(buildDraftData(STAGE_PRODUCT_QUANTITY, "dos")).toEqual({});
  });

  it("PRODUCT_AMOUNT + '15000' → amount", () => {
    expect(buildDraftData(STAGE_PRODUCT_AMOUNT, "15000")).toEqual({ amount: 15000 });
  });

  it("NEED_MORE no aporta dato (es un nodo informativo)", () => {
    expect(buildDraftData(STAGE_NEED_MORE, "no")).toEqual({});
  });
});

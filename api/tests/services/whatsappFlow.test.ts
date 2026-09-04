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
  normalizeProductCategory,
  STAGE_START,
  STAGE_CONSULTA,
  STAGE_CATEGORY,
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
  STAGE_SIZE,
  STAGE_NOTES,
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
  BUTTON_CAT_SECO,
  BUTTON_CAT_HUMEDO,
  BUTTON_CAT_ACCESORIOS,
  BUTTON_CAT_OTROS,
  type FlowCatalog,
} from "../../src/services/whatsappFlow";

describe("whatsappFlow — nextStageForAnswer", () => {
  it("START + ACTION_ORDER → CATEGORY", () => {
    expect(nextStageForAnswer(STAGE_START, BUTTON_PEDIDO.id)).toBe(STAGE_CATEGORY);
  });

  it("START + ACTION_CONSULT → CONSULTA", () => {
    expect(nextStageForAnswer(STAGE_START, BUTTON_CONSULTA.id)).toBe(STAGE_CONSULTA);
  });

  it("START + texto 'quiero un pedido' → CATEGORY", () => {
    expect(nextStageForAnswer(STAGE_START, "quiero un pedido de alimento")).toBe(
      STAGE_CATEGORY,
    );
  });

  it("START + texto de consulta genérico → CONSULTA", () => {
    expect(nextStageForAnswer(STAGE_START, "qué horario tienen?")).toBe(
      STAGE_CONSULTA,
    );
  });

  it("TYPE + TYPE_BAG → BRAND (FASE 6: la marca va antes que la especie)", () => {
    expect(nextStageForAnswer(STAGE_TYPE, BUTTON_BOLSA.id)).toBe(STAGE_BRAND);
  });

  it("TYPE + '1' (bolsa) → BRAND", () => {
    expect(nextStageForAnswer(STAGE_TYPE, "1")).toBe(STAGE_BRAND);
  });

  it("TYPE + 'bolsa' (texto libre) → BRAND", () => {
    expect(nextStageForAnswer(STAGE_TYPE, "bolsa")).toBe(STAGE_BRAND);
  });

  it("TYPE + TYPE_KILO → BRAND", () => {
    expect(nextStageForAnswer(STAGE_TYPE, BUTTON_KILO.id)).toBe(STAGE_BRAND);
  });

  it("TYPE + '2' (kilo) → BRAND", () => {
    expect(nextStageForAnswer(STAGE_TYPE, "2")).toBe(STAGE_BRAND);
  });

  it("TYPE + TYPE_MONTO → BRAND", () => {
    expect(nextStageForAnswer(STAGE_TYPE, BUTTON_MONTO.id)).toBe(STAGE_BRAND);
  });

  it("TYPE + TYPE_OTHER → OTHER", () => {
    expect(nextStageForAnswer(STAGE_TYPE, BUTTON_OTRO.id)).toBe(STAGE_OTHER);
  });

  it("TYPE + '4' (otro) → OTHER", () => {
    expect(nextStageForAnswer(STAGE_TYPE, "4")).toBe(STAGE_OTHER);
  });

  it("CATEGORY + CAT_SECO → TYPE (flujo guiado de alimento seco)", () => {
    expect(nextStageForAnswer(STAGE_CATEGORY, BUTTON_CAT_SECO.id)).toBe(STAGE_TYPE);
  });

  it("CATEGORY + '1' (seco) → TYPE", () => {
    expect(nextStageForAnswer(STAGE_CATEGORY, "1")).toBe(STAGE_TYPE);
  });

  it("CATEGORY + 'seco' (texto) → TYPE", () => {
    expect(nextStageForAnswer(STAGE_CATEGORY, "alimento balanceado seco")).toBe(
      STAGE_TYPE,
    );
  });

  it("CATEGORY + CAT_HUMEDO → PRODUCT (requerimiento)", () => {
    expect(nextStageForAnswer(STAGE_CATEGORY, BUTTON_CAT_HUMEDO.id)).toBe(STAGE_PRODUCT);
  });

  it("CATEGORY + '2' (húmedo) → PRODUCT", () => {
    expect(nextStageForAnswer(STAGE_CATEGORY, "2")).toBe(STAGE_PRODUCT);
  });

  it("CATEGORY + 'humedo' (texto) → PRODUCT", () => {
    expect(nextStageForAnswer(STAGE_CATEGORY, "humedo")).toBe(STAGE_PRODUCT);
  });

  it("CATEGORY + CAT_ACCESORIOS → PRODUCT", () => {
    expect(nextStageForAnswer(STAGE_CATEGORY, BUTTON_CAT_ACCESORIOS.id)).toBe(
      STAGE_PRODUCT,
    );
  });

  it("CATEGORY + '3' (accesorios) → PRODUCT", () => {
    expect(nextStageForAnswer(STAGE_CATEGORY, "3")).toBe(STAGE_PRODUCT);
  });

  it("CATEGORY + CAT_OTROS → PRODUCT", () => {
    expect(nextStageForAnswer(STAGE_CATEGORY, BUTTON_CAT_OTROS.id)).toBe(STAGE_PRODUCT);
  });

  it("CATEGORY + '4' (otros) → PRODUCT", () => {
    expect(nextStageForAnswer(STAGE_CATEGORY, "4")).toBe(STAGE_PRODUCT);
  });

  it("CATEGORY + respuesta no reconocida → TYPE por default (no corta)", () => {
    expect(nextStageForAnswer(STAGE_CATEGORY, "messi")).toBe(STAGE_TYPE);
  });

  it("PRODUCT (texto libre) → NOTES (requerimiento, ya no ADDRESS)", () => {
    expect(nextStageForAnswer(STAGE_PRODUCT, "Royal Canin")).toBe(STAGE_NOTES);
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

  it("START + pedido → CATEGORY (sin botones, texto numerado)", () => {
    const r = planResponse({ currentStage: STAGE_START, answer: BUTTON_PEDIDO.id });
    expect(r.nextStage).toBe(STAGE_CATEGORY);
    expect(r.buttons).toBeNull();
    expect(r.sendImage).toBe(false);
  });

  it("START + consulta → CONSULTA (handoff a humano)", () => {
    const r = planResponse({ currentStage: STAGE_START, answer: BUTTON_CONSULTA.id });
    expect(r.nextStage).toBe(STAGE_CONSULTA);
    expect(isHandoffStage(r.nextStage)).toBe(true);
  });

  it("TYPE + '1' → BRAND (FASE 6)", () => {
    const r = planResponse({ currentStage: STAGE_TYPE, answer: "1" });
    expect(r.nextStage).toBe(STAGE_BRAND);
  });

  it("PRODUCT → NOTES (requerimiento)", () => {
    const r = planResponse({ currentStage: STAGE_PRODUCT, answer: "Royal Canin" });
    expect(r.nextStage).toBe(STAGE_NOTES);
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

  it("buttonsForStage devuelve null en nodos que esperan texto (incluye TYPE y CATEGORY)", () => {
    expect(buttonsForStage(STAGE_PRODUCT)).toBeNull();
    expect(buttonsForStage(STAGE_ADDRESS)).toBeNull();
    expect(buttonsForStage(STAGE_QR)).toBeNull();
    expect(buttonsForStage(STAGE_TYPE)).toBeNull();
    expect(buttonsForStage(STAGE_CATEGORY)).toBeNull();
  });
});

describe("whatsappFlow — CATEGORY (puerta de tipo de producto)", () => {
  it("messageForStage(STAGE_CATEGORY) lista las 4 opciones numeradas", () => {
    const msg = messageForStage(STAGE_CATEGORY);
    expect(msg).toContain("¿Qué tipo de producto buscás?");
    expect(msg).toContain("1️⃣ 🐶 Alimento balanceado seco");
    expect(msg).toContain("2️⃣ 🐱 Alimento húmedo");
    expect(msg).toContain("3️⃣ 🎾 Accesorios");
    expect(msg).toContain("4️⃣ 🧺 Otros productos");
  });

  it("buttonsForStage(STAGE_CATEGORY) es null (va por texto numerado)", () => {
    expect(buttonsForStage(STAGE_CATEGORY)).toBeNull();
  });

  it("normalizeProductCategory cubre id, número y palabra", () => {
    expect(normalizeProductCategory(BUTTON_CAT_SECO.id)).toBe("seco");
    expect(normalizeProductCategory(BUTTON_CAT_HUMEDO.id)).toBe("humedo");
    expect(normalizeProductCategory(BUTTON_CAT_ACCESORIOS.id)).toBe("accesorios");
    expect(normalizeProductCategory(BUTTON_CAT_OTROS.id)).toBe("otros");
    expect(normalizeProductCategory("1")).toBe("seco");
    expect(normalizeProductCategory("2")).toBe("humedo");
    expect(normalizeProductCategory("3")).toBe("accesorios");
    expect(normalizeProductCategory("4")).toBe("otros");
    expect(normalizeProductCategory("alimento balanceado seco")).toBe("seco");
    expect(normalizeProductCategory("húmedo")).toBe("humedo");
    expect(normalizeProductCategory("humedo")).toBe("humedo");
    expect(normalizeProductCategory("accesorios")).toBe("accesorios");
    expect(normalizeProductCategory("otros productos")).toBe("otros");
    expect(normalizeProductCategory("no sé")).toBeNull();
  });

  it("buildDraftData(STAGE_CATEGORY, ...) → productCategory", () => {
    expect(buildDraftData(STAGE_CATEGORY, "1")).toEqual({ productCategory: "seco" });
    expect(buildDraftData(STAGE_CATEGORY, BUTTON_CAT_HUMEDO.id)).toEqual({
      productCategory: "humedo",
    });
    expect(buildDraftData(STAGE_CATEGORY, "3")).toEqual({
      productCategory: "accesorios",
    });
    expect(buildDraftData(STAGE_CATEGORY, "otros")).toEqual({
      productCategory: "otros",
    });
    expect(buildDraftData(STAGE_CATEGORY, "messi")).toEqual({});
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

describe("whatsappFlow — flujo guiado FASE 6 (marca→especie→etapa→peso)", () => {
  it("BRAND → SPECIES", () => {
    expect(nextStageForAnswer(STAGE_BRAND, "marca-uuid")).toBe(STAGE_SPECIES);
  });

  it("SPECIES → TYPED (etapa por vida del animal)", () => {
    expect(nextStageForAnswer(STAGE_SPECIES, "perro")).toBe(STAGE_TYPED);
  });

  it("TYPED → SIZE (bolsa) para preguntar el peso", () => {
    expect(
      nextStageForAnswer(STAGE_TYPED, "t-adulto", { orderType: "bolsa" }),
    ).toBe(STAGE_SIZE);
  });

  it("TYPED → QUANTITY (kilo) salteando SIZE", () => {
    expect(
      nextStageForAnswer(STAGE_TYPED, "t-adulto", { orderType: "kilo" }),
    ).toBe(STAGE_PRODUCT_QUANTITY);
  });

  it("TYPED → AMOUNT (monto) salteando SIZE", () => {
    expect(
      nextStageForAnswer(STAGE_TYPED, "t-adulto", { orderType: "monto" }),
    ).toBe(STAGE_PRODUCT_AMOUNT);
  });

  it("SIZE → QUANTITY (bolsa/kilo)", () => {
    expect(
      nextStageForAnswer(STAGE_SIZE, "15 kg", { orderType: "bolsa" }),
    ).toBe(STAGE_PRODUCT_QUANTITY);
  });

  it("SIZE → AMOUNT (monto)", () => {
    expect(
      nextStageForAnswer(STAGE_SIZE, "15 kg", { orderType: "monto" }),
    ).toBe(STAGE_PRODUCT_AMOUNT);
  });

  it("QUANTITY → NOTES (tras confirmar cantidad)", () => {
    expect(nextStageForAnswer(STAGE_PRODUCT_QUANTITY, "2")).toBe(STAGE_NOTES);
  });

  it("AMOUNT → NOTES (tras confirmar importe)", () => {
    expect(nextStageForAnswer(STAGE_PRODUCT_AMOUNT, "15000")).toBe(STAGE_NOTES);
  });

  it("NOTES → NEED_MORE", () => {
    expect(nextStageForAnswer(STAGE_NOTES, "raza pequeña")).toBe(STAGE_NEED_MORE);
  });

  it("NEED_MORE + 'sí' → CATEGORY (agregar otra línea)", () => {
    expect(nextStageForAnswer(STAGE_NEED_MORE, "sí, otro")).toBe(STAGE_CATEGORY);
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

  it("PRODUCT_SELECT (legacy) → QUANTITY por default, por compatibilidad", () => {
    expect(nextStageForAnswer(STAGE_PRODUCT_SELECT, "prod-uuid")).toBe(
      STAGE_PRODUCT_QUANTITY,
    );
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

  it("planResponse antepone el costo al salir de QUANTITY hacia NOTES", () => {
    const r = planResponse({
      currentStage: STAGE_PRODUCT_QUANTITY,
      answer: "2",
      catalog,
      orderType: "bolsa",
      cost: { total: 90000, detail: "2 × Pro Plan Cachorro 15kg @ $45000 = $90000" },
    });
    expect(r.nextStage).toBe(STAGE_NOTES);
    expect(r.message).toContain("$90000");
    expect(r.message).toContain("¿Alguna observación?");
    expect(r.buttons).toBeNull();
  });

  it("planResponse antepone la confirmación del match al salir de QUANTITY", () => {
    const r = planResponse({
      currentStage: STAGE_PRODUCT_QUANTITY,
      answer: "2",
      catalog,
      orderType: "bolsa",
      confirmation: {
        message: "Encontré: Pro Plan Cachorro 15kg — $90000. ¿Te lo confirmo? 🙌",
      },
    });
    expect(r.nextStage).toBe(STAGE_NOTES);
    expect(r.message).toContain("Encontré: Pro Plan Cachorro 15kg — $90000");
    expect(r.message).toContain("¿Alguna observación?");
  });

  it("planResponse(SPECIES + 'perro') avanza a TYPED (etapa) con sus botones", () => {
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

describe("whatsappFlow — FASE 6 (SIZE y NOTES)", () => {
  it("messageForStage(STAGE_SIZE) pregunta el peso/tamaño", () => {
    expect(messageForStage(STAGE_SIZE)).toContain("¿Qué peso/tamaño?");
  });

  it("messageForStage(STAGE_NOTES) pregunta la observación", () => {
    expect(messageForStage(STAGE_NOTES)).toContain("¿Alguna observación?");
  });

  it("buttonsForStage devuelve null en SIZE y NOTES (esperan texto libre)", () => {
    expect(buttonsForStage(STAGE_SIZE)).toBeNull();
    expect(buttonsForStage(STAGE_NOTES)).toBeNull();
  });

  it("buildDraftData(STAGE_SIZE, '15 kg') → sizeText", () => {
    expect(buildDraftData(STAGE_SIZE, "15 kg")).toEqual({ sizeText: "15 kg" });
  });

  it("buildDraftData(STAGE_NOTES, 'raza pequeña') → notes", () => {
    expect(buildDraftData(STAGE_NOTES, "raza pequeña")).toEqual({
      notes: "raza pequeña",
    });
  });

  it("buildDraftData(STAGE_NOTES, 'no') → notes vacío (se guarda null)", () => {
    expect(buildDraftData(STAGE_NOTES, "no")).toEqual({ notes: "" });
  });
});

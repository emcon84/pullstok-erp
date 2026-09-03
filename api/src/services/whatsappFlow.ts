// Motor de flujo guiado de WhatsApp (FASE 2).
//
// Máquina de estados que arma un pedido de reparto a base de preguntas con
// botones/texto. Es 100% pura (sin I/O): acá se decide QUÉ responderle al
// cliente y A DÓNDE se pasa el estado. El I/O (enviar por Kapso + persistir en
// DB) lo hace el websocket en handleIncomingMessage (whatsappService.ts).
//
// Los nodos se guardan como STRING en Conversation.whatsappStage (NO como enum)
// para poder agregar o renombrar nodos de flujo sin generar una migración de DB
// por cada cambio. Esa es la razón de no usar un enum en Prisma.
//
// Decisiones de diseño:
// - WhatsApp limita los botones interactivos a 3 por mensaje. START (2) y
//   PAYMENT (3) caben como botones; TYPE tiene 4 opciones (excede el límite), así
//   que se presenta como texto con opciones numeradas (1..4 + respuesta libre).
//   Esto evita agregar un sendInteractiveList y, en la práctica, resulta más
//   robusto (un número o una palabra corta es siempre un reply válido).
// - STAGE_CONSULTA / STAGE_OTHER son handoff a humano: el cliente NUNCA ve el
//   mensaje de planResponse en esos nodos, sino el puente que emite
//   escalateConversation (el flujo se lo toma un operador).

// ---------------------------------------------------------------------------
// Constantes de nodo del flujo.
// ---------------------------------------------------------------------------

export const STAGE_START = "START";
export const STAGE_CONSULTA = "CONSULTA";
export const STAGE_TYPE = "TYPE";
export const STAGE_PRODUCT = "PRODUCT";
export const STAGE_AMOUNT = "AMOUNT";
export const STAGE_PROD_AMOUNT = "PROD_AMOUNT";
export const STAGE_ADDRESS = "ADDRESS";
export const STAGE_PAYMENT = "PAYMENT";
export const STAGE_QR = "QR";
export const STAGE_OTHER = "OTHER";
// Terminales: el pedido quedó armado → se entrega a un operador humano.
export const STAGE_PAYMENT_DONE = "PAYMENT_DONE";
export const STAGE_DONE = "DONE";

// ---------------------------------------------------------------------------
// Botones. Los id son los que Kapso devuelve en interactive.button_reply.id
// (payment) o los que la UI de START manda como botón. TYPE se presenta como
// texto numerado, así que sus botones se listan por completitud/detección pero
// NO se envían como interactive buttons.
// ---------------------------------------------------------------------------

export const BUTTON_PEDIDO = { id: "ACTION_ORDER", title: "🛒 Hacer un pedido" };
export const BUTTON_CONSULTA = {
  id: "ACTION_CONSULT",
  title: "❓ Hacer una consulta",
};
export const BUTTON_BOLSA = { id: "TYPE_BAG", title: "🛍️ Bolsa cerrada" };
export const BUTTON_KILO = { id: "TYPE_KILO", title: "⚖️ Por kilo" };
export const BUTTON_MONTO = { id: "TYPE_AMOUNT", title: "💵 Por monto" };
export const BUTTON_OTRO = { id: "TYPE_OTHER", title: "🤔 Otro" };
export const BUTTON_QR = { id: "PAY_QR", title: "📲 QR" };
export const BUTTON_TRANSFERENCIA = {
  id: "PAY_TRANSFER",
  title: "🏦 Transferencia",
};
export const BUTTON_EFECTIVO = { id: "PAY_CASH", title: "💵 Efectivo" };

/**
 * Botones interactivos para un nodo. Devuelve null cuando el nodo espera texto
 * libre (esos se mandan con sendText). TYPE no va por botones interactivos sino
 * por texto numerado (ver nota del encabezado), por eso también devuelve null.
 */
export function buttonsForStage(stage: string): { id: string; title: string }[] | null {
  switch (stage) {
    case STAGE_START:
      return [BUTTON_PEDIDO, BUTTON_CONSULTA];
    case STAGE_PAYMENT:
      return [BUTTON_QR, BUTTON_TRANSFERENCIA, BUTTON_EFECTIVO];
    default:
      return null;
  }
}

/**
 * Mensaje que el cliente ve al ENTRAR a un nodo (el texto del body). Cálido,
 * breve y voseo suave. TYPE lleva las opciones numeradas embebidas porque no va
 * con botones interactivos.
 */
export function messageForStage(stage: string): string {
  switch (stage) {
    case STAGE_START:
      return "¡Hola! 👋 Soy el asistente de El Almacén de las Mascotas. ¿Qué necesitás hoy?";
    case STAGE_TYPE:
      return [
        "¿Qué tipo de pedido querés hacer? Elegí una opción:",
        "1️⃣ Bolsa cerrada",
        "2️⃣ Por kilo",
        "3️⃣ Por monto",
        "4️⃣ Otro",
        "Respondé con el número o el nombre.",
      ].join("\n");
    case STAGE_PRODUCT:
      return "¿Qué producto estás buscando? Contame el nombre o la marca.";
    case STAGE_AMOUNT:
      return "¿Cuánto querés gastar? Decime el importe (ej: 50000).";
    case STAGE_PROD_AMOUNT:
      return "¿Por cuánto lo querés? Decime el importe (ej: 50000) o el peso.";
    case STAGE_ADDRESS:
      return "¿A qué dirección lo llevamos? Decime calle, número y localidad.";
    case STAGE_PAYMENT:
      return "¿Cómo querés pagar?";
    case STAGE_QR:
      return "📲 Escaneá este código QR para pagar. Cuando esté listo, confirmame 🙌";
    // Handoff a humano: el client NO ve estos por planResponse (los emite
    // escalateConversation como puente único). Se definen por completitud.
    case STAGE_CONSULTA:
      return "¡Buenísimo! Te conecto con una persona del equipo para responderte 🙌";
    case STAGE_OTHER:
      return "¡Buenísimo! Te conecto con una persona del equipo para ayudarte 🙌";
    case STAGE_PAYMENT_DONE:
    case STAGE_DONE:
      return "¡Listo! 👍 Pedido registrado, un asesor te lo confirma en breve.";
    default:
      return "¿En qué más te puedo ayudar?";
  }
}

// Normaliza la respuesta del usuario (id de botón o texto libre) a minúsculas
// y sin espacios al principio/fin, para comparar keywords/ids sin colisiones.
const norm = (answer: string): string => (answer ?? "").trim().toLowerCase();

/**
 * Nodo siguiente según la respuesta del cliente. La respuesta puede venir como
 * un id de botón (interactive.button_reply.id) o como texto libre (los nodos que
 * esperan texto las responden con palabras). Para los nodos de texto aceptamos
 * varias formas (número o palabra) para no cortar el flujo si el cliente escribe
 * distinto a lo esperado — un fallo de match NUNCA debe matar la conversación.
 */
export function nextStageForAnswer(currentStage: string, answer: string): string {
  const a = norm(answer);
  const has = (kw: string) => a.includes(kw);

  switch (currentStage) {
    case STAGE_START:
      // Botones del nodo START.
      if (a === BUTTON_PEDIDO.id.toLowerCase()) return STAGE_TYPE;
      if (a === BUTTON_CONSULTA.id.toLowerCase()) return STAGE_CONSULTA;
      // Texto libre en START: si pedido → TYPE; si no → consulta (handoff).
      if (has("pedido") || has("comprar") || has("orden") || has("encargar")) {
        return STAGE_TYPE;
      }
      return STAGE_CONSULTA;

    case STAGE_TYPE:
      // Botones (por si Kapso mandara alguno) + números + palabras libres.
      if (a === BUTTON_BOLSA.id.toLowerCase() || has("bolsa") || a === "1") {
        return STAGE_PRODUCT;
      }
      if (a === BUTTON_KILO.id.toLowerCase() || has("kilo") || a === "2") {
        return STAGE_PRODUCT;
      }
      if (a === BUTTON_MONTO.id.toLowerCase() || has("monto") || a === "3") {
        return STAGE_PRODUCT;
      }
      if (a === BUTTON_OTRO.id.toLowerCase() || has("otro") || a === "4") {
        return STAGE_OTHER;
      }
      // Respuesta no reconocida en TYPE → default bolsa: sigue el pedido en vez
      // de cortar el flujo con un error confuso.
      return STAGE_PRODUCT;

    case STAGE_PRODUCT:
      // FASE 2 (simplicidad): tras elegir el producto se pasa directo a dirección.
      // La rama "por monto con cálculo" (STAGE_PROD_AMOUNT) es FASE 3.
      return STAGE_ADDRESS;

    case STAGE_AMOUNT:
    case STAGE_PROD_AMOUNT:
      return STAGE_ADDRESS;

    case STAGE_ADDRESS:
      return STAGE_PAYMENT;

    case STAGE_PAYMENT:
      // Botones + palabras libres.
      if (a === BUTTON_QR.id.toLowerCase() || has("qr")) return STAGE_QR;
      if (
        a === BUTTON_TRANSFERENCIA.id.toLowerCase() ||
        has("transfer") ||
        has("banco") ||
        has("transf")
      ) {
        return STAGE_PAYMENT_DONE;
      }
      if (a === BUTTON_EFECTIVO.id.toLowerCase() || has("efectivo") || has("cash")) {
        return STAGE_PAYMENT_DONE;
      }
      // Respuesta no reconocida: asumimos que elige pagar de alguna forma.
      return STAGE_PAYMENT_DONE;

    case STAGE_QR:
      // Tras mandar el QR, la siguiente respuesta cierra el pedido.
      return STAGE_PAYMENT_DONE;

    case STAGE_CONSULTA:
    case STAGE_OTHER:
    case STAGE_DONE:
    case STAGE_PAYMENT_DONE:
      return STAGE_DONE;

    default:
      return STAGE_START;
  }
}

/** Nodo terminal: el pedido quedó armado y ya no se pregunta más. */
export function isTerminalStage(stage: string): boolean {
  return stage === STAGE_DONE || stage === STAGE_PAYMENT_DONE;
}

/** Nodo de handoff directo a humano (consulta / "otro"). */
export function isHandoffStage(stage: string): boolean {
  return stage === STAGE_CONSULTA || stage === STAGE_OTHER;
}

/** Escalada a humano en cualquier punto terminal o de handoff. */
export function shouldEscalate(stage: string): boolean {
  return isTerminalStage(stage) || isHandoffStage(stage);
}

// ---------------------------------------------------------------------------
// Captura de datos del borrador (FASE 3) — funciones PURAS, testeadas.
// ---------------------------------------------------------------------------

/**
 * Normaliza la respuesta del nodo TYPE a uno de los 4 tipos del borrador.
 * Acepta el id de botón (TYPE_BAG/TYPE_KILO/TYPE_AMOUNT/TYPE_OTHER), el número
 * (1..4) o la palabra libre (bolsa/kilo/monto/otro) — mismo matching que
 * nextStageForAnswer. Respuesta no reconocida → null (el flujo default cae a
 * "bolsa", pero acá no inventamos tipo).
 */
export function normalizeOrderType(answer: string): string | null {
  const a = norm(answer);
  const has = (kw: string) => a.includes(kw);
  if (a === BUTTON_BOLSA.id.toLowerCase() || a === "1" || has("bolsa")) {
    return "bolsa";
  }
  if (a === BUTTON_KILO.id.toLowerCase() || a === "2" || has("kilo")) {
    return "kilo";
  }
  if (a === BUTTON_MONTO.id.toLowerCase() || a === "3" || has("monto")) {
    return "monto";
  }
  if (a === BUTTON_OTRO.id.toLowerCase() || a === "4" || has("otro")) {
    return "otro";
  }
  return null;
}

/**
 * Normaliza la respuesta del nodo PAYMENT a uno de los 3 medios del borrador.
 * Ids (PAY_QR/PAY_TRANSFER/PAY_CASH) + palabras libres (qr/transferencia/
 * efectivo). No reconocido → null.
 */
export function normalizePaymentMethod(answer: string): string | null {
  const a = norm(answer);
  const has = (kw: string) => a.includes(kw);
  if (a === BUTTON_QR.id.toLowerCase() || has("qr")) return "qr";
  if (
    a === BUTTON_TRANSFERENCIA.id.toLowerCase() ||
    has("transfer") ||
    has("transf") ||
    has("banco")
  ) {
    return "transferencia";
  }
  if (a === BUTTON_EFECTIVO.id.toLowerCase() || has("efectivo") || has("cash")) {
    return "efectivo";
  }
  return null;
}

/**
 * Devuelve el dato de borrador que el cliente aportó en su última respuesta, a
 * partir del nodo en el que estaba (currentStage) y el `answer`. Es la función
 * MINIMALISTA que evita re-parsear la conversación: el service (whatsappService)
 * mergea el resultado en el acumulador JSON de la Conversation (FASE 3).
 *
 * Nodos informativos (START, QR, terminales) devuelven {} (no aportan datos).
 * STAGE_AMOUNT / STAGE_PROD_AMOUNT (rama "por monto" con cálculo, FASE 4) se
 * capturan por completitud aunque hoy el flujo no los alcanza (quedan null).
 */
export function buildDraftData(
  currentStage: string | null,
  answer: string,
): {
  orderType?: string;
  productText?: string;
  quantityKg?: number;
  amount?: number;
  address?: string;
  paymentMethod?: string;
} {
  const a = norm(answer);
  switch (currentStage) {
    case STAGE_TYPE: {
      const orderType = normalizeOrderType(answer);
      return orderType ? { orderType } : {};
    }
    case STAGE_PRODUCT:
      // El producto se guarda tal cual lo escribió el cliente (texto libre).
      return { productText: a };
    case STAGE_AMOUNT:
    case STAGE_PROD_AMOUNT: {
      const amount = parseFloat(a);
      return Number.isFinite(amount) ? { amount } : {};
    }
    case STAGE_ADDRESS:
      return { address: a };
    case STAGE_PAYMENT: {
      const paymentMethod = normalizePaymentMethod(answer);
      return paymentMethod ? { paymentMethod } : {};
    }
    default:
      return {};
  }
}

/**
 * Mergea los datos previos del borrador con el patch recién capturado. Pura y
 * defensiva: `existing` puede venir null (Conversation.whatsappDraftData Json?)
 * y el patch puede ser {} (nodos informativos). El patch PISA (el cliente pudo
 * corregir un dato al re-contestar el mismo nodo).
 */
export function mergeDraftData(
  existing: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return { ...(existing ?? {}), ...patch };
}

// Texto de respaldo cuando el QR no tiene URL configurada (sin mandar imagen).
const QR_NO_IMAGE_TEXT =
  "📲 Elegiste pagar con QR. El código QR te lo comparto por este canal en un momento 🙌";

/**
 * Orquestador de decisión (puro, sin I/O): a partir del nodo actual y la
 * respuesta del cliente devuelve QUÉ responder (mensaje + botones/imagen) y A
 * DÓNDE se pasa. handleIncomingMessage solo ejecuta el I/O con este resultado.
 *
 * Primer contacto: cuando `currentStage` es null (conversación recién creada o
 * que nunca entró al flujo) se saluda con el nodo START y sus botones de inicio;
 * eso dispara la bienvenida y arranca el flujo. La excepción: msj. de inicio.
 */
export function planResponse(input: {
  currentStage: string | null;
  answer: string;
  qrImageUrl?: string;
}): {
  nextStage: string;
  message: string;
  buttons: { id: string; title: string }[] | null;
  sendImage: boolean;
} {
  const { currentStage, answer, qrImageUrl } = input;

  // Nunca estuvo en flujo → saludar y plantar los botones de START.
  if (!currentStage) {
    return {
      nextStage: STAGE_START,
      message: messageForStage(STAGE_START),
      buttons: buttonsForStage(STAGE_START),
      sendImage: false,
    };
  }

  const next = nextStageForAnswer(currentStage, answer);

  // Nodo QR: si hay URL mandamos la imagen; si no, texto de respaldo.
  if (next === STAGE_QR) {
    if (qrImageUrl) {
      return {
        nextStage: next,
        message: messageForStage(STAGE_QR),
        buttons: null,
        sendImage: true,
      };
    }
    return {
      nextStage: next,
      message: QR_NO_IMAGE_TEXT,
      buttons: null,
      sendImage: false,
    };
  }

  return {
    nextStage: next,
    message: messageForStage(next),
    buttons: buttonsForStage(next),
    sendImage: false,
  };
}

export default {
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
  STAGE_PAYMENT_DONE,
  STAGE_DONE,
  BUTTON_PEDIDO,
  BUTTON_CONSULTA,
  BUTTON_BOLSA,
  BUTTON_KILO,
  BUTTON_MONTO,
  BUTTON_OTRO,
  BUTTON_QR,
  BUTTON_TRANSFERENCIA,
  BUTTON_EFECTIVO,
};

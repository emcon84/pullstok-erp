import { prisma } from "../config/db";
import getNextSequenceValue from "./secuenceService";
import { requireOrganizationId } from "../config/tenantContext";
import { emitOrdersChanged } from "../realtime/socket";
import { sendText } from "./whatsappService";

// Notifica a los clientes del comercio que la lista de pedidos cambió. Envuelto
// en try/catch: un fallo del socket NUNCA debe romper la operación HTTP.
const notifyOrdersChanged = () => {
  try {
    emitOrdersChanged(requireOrganizationId());
  } catch (err: any) {
    console.error(
      "[whatsappOrderService] emitOrdersChanged falló:",
      err?.message ?? err,
    );
  }
};

// Cliente genérico cuando el borrador no tiene Customer linkeado (el phone de
// WhatsApp no matcheó uno de la org). Mismo criterio que orderController.createOrder.
const GENERIC_CUSTOMER_EMAIL = "consumidor-final@local";

// Resuelve el customerId del pedido: usa el del borrador si existe; si no, el
// genérico "Consumidor final" (find-or-create idempotente por email).
const resolveCustomerId = async (
  draftCustomerId: string | null,
  organizationId: string,
): Promise<string> => {
  if (draftCustomerId) return draftCustomerId;
  const existing = await prisma.customer.findFirst({
    where: { email: GENERIC_CUSTOMER_EMAIL },
  });
  if (existing) return existing.id;
  const created = await prisma.customer.create({
    data: {
      name: "Consumidor final",
      email: GENERIC_CUSTOMER_EMAIL,
      organizationId,
    },
  });
  return created.id;
};

/** Lista los borradores de pedido de WhatsApp pendientes de revisión (más
 *  recientes primero), con el Customer y la Conversation para pintar la fila. */
export const listDrafts = async () => {
  return prisma.whatsAppOrderDraft.findMany({
    where: { status: "PENDING_REVIEW" },
    orderBy: { createdAt: "desc" },
    include: { customer: true, conversation: true },
  });
};

/**
 * Aprueba un borrador de WhatsApp creando el pedido real (Order). Replica el
 * patrón de orderController.createOrder (correlativos PED-/REM-, sin tocar
 * stock: el pedido es un borrador editable) PERO dentro del service y marcando
 * el draft como APPROVED con el orderId. Idempotente: un draft ya APPROVED →
 * lanza Error con status 409.
 */
export const approveDraft = async (
  id: string,
  body: { products: { productId: string; quantity: number; price: number }[]; totalAmount: number },
) => {
  const draft = await prisma.whatsAppOrderDraft.findFirst({ where: { id } });
  if (!draft) {
    const err = new Error("Borrador de pedido no encontrado") as Error & {
      status: number;
    };
    err.status = 404;
    throw err;
  }
  if (draft.status === "APPROVED") {
    const err = new Error("El borrador ya fue aprobado") as Error & {
      status: number;
    };
    err.status = 409;
    throw err;
  }

  const organizationId = requireOrganizationId();
  const customerId = await resolveCustomerId(draft.customerId, organizationId);

  // Numeración por tipo: el pedido tiene su serie (PED-) y el remito la suya (REM-).
  const orderSeq = await getNextSequenceValue(organizationId, "order");
  const orderNumber = `PED-${orderSeq.toString().padStart(4, "0")}`;
  const receiptSeq = await getNextSequenceValue(organizationId, "receipt");
  const receiptNumber = `REM-${receiptSeq.toString().padStart(4, "0")}`;

  const newOrder = await prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        organizationId,
        customerId,
        totalAmount: body.totalAmount,
        status: "PENDING",
        type: "SALE",
        source: "WHATSAPP",
        receipt: orderNumber,
        items: {
          create: body.products.map((p) => ({
            productId: p.productId,
            quantity: p.quantity,
            price: p.price,
          })),
        },
      },
      include: { items: { include: { product: true } }, customer: true },
    });

    await tx.receipt.create({
      data: {
        organizationId,
        type: "receipt",
        relatedDocument: order.id,
        receiptNumber,
      },
    });

    // WhatsAppOrderDraft es tenant-model → update singular está bloqueado por la
    // extensión anti-fuga; se usa updateMany (recibe el scope de org).
    await tx.whatsAppOrderDraft.updateMany({
      where: { id },
      data: { status: "APPROVED", orderId: order.id },
    });

    return order;
  });

  const updatedDraft = await prisma.whatsAppOrderDraft.findFirst({ where: { id } });
  notifyOrdersChanged();
  return { order: newOrder, draft: updatedDraft };
};

/** Rechaza un borrador de WhatsApp: pasa a REJECTED (no crea ningún pedido). */
export const rejectDraft = async (id: string) => {
  await prisma.whatsAppOrderDraft.updateMany({
    where: { id },
    data: { status: "REJECTED" },
  });
  return { ok: true };
};

/** Etiqueta de medio de pago para el mensaje de confirmación. */
const PAYMENT_LABELS: Record<string, string> = {
  qr: "QR",
  transferencia: "Transferencia",
  efectivo: "Efectivo",
};

/**
 * Arma el mensaje de confirmación DEFAULT con los ítems del pedido + dirección +
 * forma de pago. El front puede mandar un `message` custom; si no, se arma acá.
 */
export const buildOrderConfirmationMessage = (draft: any): string => {
  const lines = Array.isArray(draft?.items)
    ? draft.items
        .map((it: any) => {
          const name = it?.productName ?? it?.product ?? "ítem";
          const qty = it?.quantity != null ? ` x${it.quantity}` : "";
          const tot = it?.total != null ? ` — $${it.total}` : "";
          return `- ${name}${qty}${tot}`;
        })
        .join("\n")
    : "";
  const address = draft?.address ? `\n📦 Dirección: ${draft.address}` : "";
  const payment =
    draft?.paymentMethod && PAYMENT_LABELS[draft.paymentMethod]
      ? `\n💳 Pago: ${PAYMENT_LABELS[draft.paymentMethod]}`
      : "";
  return [
    `¡Hola ${draft?.contactName ?? ""}! 🙌 Te confirmamos tu pedido:`,
    lines || "· pedido a confirmar por un asesor",
    address,
    payment,
    "Cualquier consulta, te respondemos por este canal. 😊",
  ]
    .filter(Boolean)
    .join("\n");
};

/**
 * Envía una confirmación al cliente por WhatsApp (FASE 6). Busca el borrador por
 * id (404 si no existe), exigiendo teléfono. El envío va en try/catch y NUNCA
 * rompe la respuesta HTTP (patrón de postOperatorMessage en chatController):
 * devuelve { ok: true } si Kapso entregó, { ok: false } si no.
 */
export const sendConfirmation = async (id: string, message?: string) => {
  const draft = await prisma.whatsAppOrderDraft.findFirst({ where: { id } });
  if (!draft) {
    const err = new Error("Borrador de pedido no encontrado") as Error & {
      status: number;
    };
    err.status = 404;
    throw err;
  }
  if (!draft.phone) {
    const err = new Error(
      "El borrador no tiene teléfono para enviar la confirmación",
    ) as Error & { status: number };
    err.status = 400;
    throw err;
  }

  const finalMessage = (message ?? "").trim() || buildOrderConfirmationMessage(draft);
  try {
    const sent = await sendText(draft.phone, finalMessage);
    return { ok: sent };
  } catch (err: any) {
    console.error(
      "[whatsappOrderService] no se pudo enviar la confirmación",
      err?.message ?? err,
    );
    return { ok: false };
  }
};

export default {
  listDrafts,
  approveDraft,
  rejectDraft,
  sendConfirmation,
  buildOrderConfirmationMessage,
};

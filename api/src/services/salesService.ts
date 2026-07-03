import { prisma, basePrisma } from "../config/db";
import { requireOrganizationId } from "../config/tenantContext";
import { sendMail } from "./mailService";
import { saleConfirmedEmail } from "./mailTemplates";
import { emitOrdersChanged } from "../realtime/socket";

interface IProductSale {
  productId: string;
  name: string;
  quantity: number;
  category: string;
  price: number;
}

interface ISaleRequest {
  products: IProductSale[];
  // Opcional: pedido de la tienda online que esta venta procesa. Si viene, la
  // Order se cierra (COMPLETED), se enlaza a la Sale y se manda mail al cliente.
  orderId?: string;
}

const createSale = async (saleRequest: ISaleRequest) => {
  const organizationId = requireOrganizationId();

  if (!Array.isArray(saleRequest.products) || saleRequest.products.length === 0) {
    throw new Error("La venta debe incluir al menos un producto");
  }

  const orderId = saleRequest.orderId;

  // Toda la venta se ejecuta en una transacción: o se descuenta TODO el stock
  // y se crea la venta, o no se toca nada. Evita el "stock fantasma".
  const sale = await prisma.$transaction(async (tx) => {
    let totalAmount = 0;
    const saleItems: {
      productId: string;
      name: string;
      quantity: number;
      category: string;
      price: number;
    }[] = [];

    for (const item of saleRequest.products) {
      if (!item.productId || !item.quantity || !item.price) {
        throw new Error("Faltan campos requeridos en un producto de la venta");
      }

      const quantity = parseInt(String(item.quantity), 10);
      const price = parseFloat(String(item.price));

      const product = await tx.product.findFirst({
        where: { id: item.productId, organizationId },
        include: { category: true },
      });
      if (!product) {
        throw new Error(`Producto ${item.productId} no encontrado`);
      }
      if (product.quantity < quantity) {
        throw new Error(`Stock insuficiente para el producto ${product.name}`);
      }

      // Descuento atómico y condicionado: solo descuenta si todavía hay stock.
      const updated = await tx.product.updateMany({
        where: { id: product.id, organizationId, quantity: { gte: quantity } },
        data: { quantity: { decrement: quantity } },
      });
      if (updated.count === 0) {
        throw new Error(`Stock insuficiente para el producto ${product.name}`);
      }

      saleItems.push({
        productId: product.id,
        name: product.name,
        quantity,
        // SaleItem.category es snapshot histórico (string), no FK: queda
        // congelado el nombre de categoría al momento de la venta aunque la
        // Category se renombre o borre después.
        category: product.category?.name ?? "Sin categoría",
        price,
      });
      totalAmount += price * quantity;
    }

    // Si la venta procesa un pedido de la tienda, validar la Order ANTES de
    // crear la venta. tx.order.findFirst está scoped por la extensión anti-fuga
    // (una Order de otra org devuelve null → 404 efectivo). No re-procesar un
    // pedido ya cerrado (evita doble venta / doble mail).
    if (orderId) {
      const order = await tx.order.findFirst({ where: { id: orderId } });
      if (!order) {
        throw new Error(`Pedido ${orderId} no encontrado`);
      }
      if (order.status === "COMPLETED") {
        throw new Error("El pedido ya fue procesado");
      }
    }

    const created = await tx.sale.create({
      data: {
        organizationId,
        totalAmount,
        ...(orderId ? { orderId } : {}),
        items: { create: saleItems },
      },
      include: { items: true },
    });

    // Cerrar el pedido: update singular está bloqueado en modelos tenant, se usa
    // updateMany (scoped a la org por la extensión).
    if (orderId) {
      await tx.order.updateMany({
        where: { id: orderId },
        data: { status: "COMPLETED" },
      });
    }

    return created;
  });

  // Si esta venta cerró un pedido de tienda (order → COMPLETED), el conteo de
  // pendientes bajó → señal de tiempo real para refetchear. Try/catch: un fallo
  // del socket NO debe afectar la venta ya commiteada.
  if (orderId) {
    try {
      emitOrdersChanged(organizationId);
    } catch (socketError: any) {
      console.error(
        `[salesService.createSale] emitOrdersChanged falló (order=${orderId}):`,
        socketError?.message ?? socketError,
      );
    }
  }

  // Mail "Tu compra fue confirmada" — FUERA de la transacción (ya commiteó). Un
  // fallo de mail NO revierte la venta: try/catch no-bloqueante. Solo se manda
  // si la venta cerró un pedido de tienda (tiene customer con email).
  if (orderId) {
    try {
      const order = await prisma.order.findFirst({
        where: { id: orderId },
        include: { customer: true },
      });
      const organization = await basePrisma.organization.findUnique({
        where: { id: organizationId },
        select: { name: true },
      });
      const storeSettings = await basePrisma.storeSettings.findUnique({
        where: { organizationId },
      });

      if (order?.customer?.email && organization) {
        const { subject, html } = saleConfirmedEmail({
          org: { name: organization.name },
          storeSettings,
          customerName: order.customer.name,
          orderRef: order.id.slice(0, 8).toUpperCase(),
          items: sale.items.map((i) => ({
            name: i.name,
            quantity: i.quantity,
            price: i.price,
          })),
          total: sale.totalAmount,
        });
        await sendMail({ to: order.customer.email, subject, html });
      }
    } catch (mailError: any) {
      console.error(
        `[salesService.createSale] Fallo al enviar mail de confirmación (order=${orderId}):`,
        mailError?.message ?? mailError,
      );
    }
  }

  return sale;
};

const getAllSales = async () => {
  return prisma.sale.findMany({
    include: {
      items: { include: { product: true } },
      // Expone si la venta ya tiene factura y su id (para que el front
      // muestre el botón "Facturar" solo cuando invoice === null).
      invoice: { select: { id: true } },
    },
  });
};

const getSaleById = async (id: string) => {
  return prisma.sale.findFirst({
    where: { id },
    include: { items: { include: { product: true } } },
  });
};

export default {
  createSale,
  getAllSales,
  getSaleById,
};

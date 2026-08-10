import { prisma, basePrisma } from "../config/db";
import { requireOrganizationId } from "../config/tenantContext";
import { sendMail } from "./mailService";
import { saleConfirmedEmail } from "./mailTemplates";
import { emitOrdersChanged } from "../realtime/socket";
import { round2 } from "../utils/money";

interface IProductSale {
  productId: string;
  name: string;
  quantity: number;
  category: string;
  price: number;
  // Modo de venta del renglón (sdd/venta-alimento-suelto B-08): ausente =
  // legacy BOLSA_CERRADA (el schema lo normaliza con .default()).
  saleMode?: "BOLSA_CERRADA" | "POR_PESO" | "POR_MONTO";
}

interface ISaleRequest {
  products: IProductSale[];
  // Opcional: pedido de la tienda online que esta venta procesa. Si viene, la
  // Order se cierra (COMPLETED), se enlaza a la Sale y se manda mail al cliente.
  orderId?: string;
}

const createSale = async (saleRequest: ISaleRequest, userId?: string, role?: string) => {
  const organizationId = requireOrganizationId();

  if (!Array.isArray(saleRequest.products) || saleRequest.products.length === 0) {
    throw new Error("La venta debe incluir al menos un producto");
  }

  const orderId = saleRequest.orderId;

  // ── Resolve seller's branch for VENDEDOR / CASHIER ──
  // Only branch-assigned roles are scoped. ADMIN/MANAGEMENT keep the legacy
  // product.quantity flow (HQ global stock). SUPERADMIN and other roles also
  // fall through to the legacy path.
  let sellerBranchId: string | null = null;
  if (userId && (role === "VENDEDOR" || role === "CASHIER")) {
    const assignments = await basePrisma.branchAssignment.findMany({
      where: { userId },
      select: { branchId: true },
    });
    const branchIds = assignments.map((a) => a.branchId);

    if (branchIds.length === 0) {
      throw new Error(
        "No tenés una sucursal asignada. Contactá a un administrador.",
      );
    }
    if (branchIds.length > 1) {
      throw new Error(
        "Tenés múltiples sucursales asignadas. Seleccioná una para vender.",
      );
    }
    sellerBranchId = branchIds[0];

    // Verify the branch exists and is active
    const branch = await prisma.branch.findFirst({
      where: { id: sellerBranchId, isActive: true },
    });
    if (!branch) {
      throw new Error("Tu sucursal asignada no está activa.");
    }
  }

  // ── Transaction ──
  const sale = await prisma.$transaction(async (tx) => {
    let totalAmount = 0;
    const saleItems: {
      productId: string;
      name: string;
      quantity: number;
      category: string;
      price: number;
      saleMode: "BOLSA_CERRADA" | "POR_PESO" | "POR_MONTO";
    }[] = [];

    for (const item of saleRequest.products) {
      if (!item.productId || !item.quantity || !item.price) {
        throw new Error("Faltan campos requeridos en un producto de la venta");
      }

      // B-06: la cantidad puede ser decimal (kg / monto). Number() en lugar de
      // parseInt (que truncaba los kg sueltos): el schema ya validó la forma.
      const quantity = Number(String(item.quantity));
      const price = parseFloat(String(item.price));
      const saleMode: "BOLSA_CERRADA" | "POR_PESO" | "POR_MONTO" =
        item.saleMode ?? "BOLSA_CERRADA";

      const product = await tx.product.findFirst({
        where: { id: item.productId, organizationId },
        include: { category: true },
      });
      if (!product) {
        throw new Error(`Producto ${item.productId} no encontrado`);
      }

      // ── Loose mode gates (B-08/B-06 amendment) — antes de tocar stock ──
      if (saleMode === "POR_PESO" || saleMode === "POR_MONTO") {
        const priceKgSuelto = product.priceKgSuelto as number | null;
        if (!(priceKgSuelto && priceKgSuelto > 0)) {
          const err: any = new Error(
            `"${product.name}" no tiene precio por kg suelto configurado`,
          );
          err.code = "LOOSE_NOT_ELIGIBLE";
          throw err;
        }
        if (!sellerBranchId) {
          // B-06 amendment: el stock suelto fraccionario solo se puede
          // bookkeepear en ProductStock (sucursal); Product.quantity (legacy,
          // Int) no puede mantener fracciones de kg.
          const err: any = new Error(
            "Las ventas sueltas requieren una sucursal asignada (el stock fraccionario se descuenta de la sucursal)",
          );
          err.code = "LOOSE_REQUIRES_BRANCH";
          throw err;
        }
      }

      // ── Resolución de cantidad y precio por modo ──
      // BOLSA_CERRADA / POR_PESO: la cantidad ya es la unidad final (bolsas /
      // kg) y el precio es el unitario (para sueltos, el front manda
      // priceKgSuelto como price). POR_MONTO: el cliente manda el MONTO en
      // quantity; el server convierte de forma autoritativa (B-07) y guarda el
      // snapshot de priceKgSuelto para que kg × priceKgSuelto reproduzca el
      // total exactamente.
      let lineQuantity = quantity;
      let linePrice = price;
      if (saleMode === "POR_MONTO") {
        const priceKgSuelto = product.priceKgSuelto as number;
        lineQuantity = round2(quantity / priceKgSuelto); // kg = round2(amount ÷ priceKgSuelto)
        linePrice = priceKgSuelto; // snapshot congelado (B-04)
      }

      if (sellerBranchId) {
        // ── Branch-scoped sale: check & deduct from ProductStock ──
        const stock = await tx.productStock.findFirst({
          where: {
            productId: product.id,
            branchId: sellerBranchId,
            organizationId,
          },
        });
        if (!stock || stock.quantity < lineQuantity) {
          throw new Error(
            `Stock insuficiente de "${product.name}" en tu sucursal`,
          );
        }

        const updated = await tx.productStock.updateMany({
          where: {
            productId: product.id,
            branchId: sellerBranchId,
            organizationId,
            quantity: { gte: lineQuantity },
          },
          data: { quantity: { decrement: lineQuantity } },
        });
        if (updated.count === 0) {
          throw new Error(
            `Stock insuficiente de "${product.name}" en tu sucursal`,
          );
        }
      } else {
        // ── Legacy / admin sale: deduct from product.quantity (HQ global) ──
        if (product.quantity < lineQuantity) {
          throw new Error(
            `Stock insuficiente para el producto ${product.name}`,
          );
        }

        const updated = await tx.product.updateMany({
          where: {
            id: product.id,
            organizationId,
            quantity: { gte: lineQuantity },
          },
          data: { quantity: { decrement: lineQuantity } },
        });
        if (updated.count === 0) {
          throw new Error(
            `Stock insuficiente para el producto ${product.name}`,
          );
        }
      }

      // Per-line total: round2 en el límite (D2). POR_MONTO ya viene resuelto
      // como kg × priceKgSuelto (B-07) → round2 de nuevo no cambia nada.
      saleItems.push({
        productId: product.id,
        name: product.name,
        quantity: lineQuantity,
        category: product.category?.name ?? "Sin categoría",
        price: linePrice,
        saleMode,
      });
      totalAmount += round2(lineQuantity * linePrice);
    }

    // ── Order validation (same as before) ──
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
        ...(sellerBranchId ? { branchId: sellerBranchId } : {}),
        ...(orderId ? { orderId } : {}),
        items: { create: saleItems },
      },
      include: { items: true },
    });

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

const getAllSales = async (branchId?: string) => {
  const where: Record<string, unknown> = {};
  if (branchId) {
    where.branchId = branchId;
  }

  return prisma.sale.findMany({
    where,
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

// Elimina una venta y restaura el stock a su origen (ProductStock por sucursal
// o Product global), revirtiendo el pedido asociado a PENDING si existía.
// Ruta protegida: solo ADMIN/MANAGEMENT. Una venta FACTURADA no se puede borrar
// (la factura queda como comprobante fiscal, sin importar su estado).
export const deleteSale = async (id: string) => {
  const organizationId = requireOrganizationId();

  const sale = await prisma.sale.findFirst({
    where: { id },
    include: { items: true, invoice: true },
  });
  if (!sale) {
    const err: any = new Error("Venta no encontrada");
    err.code = "SALE_NOT_FOUND";
    throw err;
  }
  if (sale.invoice) {
    const err: any = new Error("No se puede eliminar una venta facturada");
    err.code = "SALE_ALREADY_INVOICED";
    throw err;
  }

  await prisma.$transaction(async (tx) => {
    // Los items se borran en cascada (onDelete: Cascade en el schema).
    await tx.sale.deleteMany({ where: { id } });

    if (sale.branchId) {
      // Venta scoped a sucursal → reponer ProductStock.
      for (const item of sale.items) {
        await tx.productStock.updateMany({
          where: {
            productId: item.productId,
            branchId: sale.branchId,
            organizationId: sale.organizationId,
          },
          data: { quantity: { increment: item.quantity } },
        });
      }
    } else {
      // Venta legacy / admin → reponer Product.quantity (stock global).
      for (const item of sale.items) {
        await tx.product.updateMany({
          where: {
            id: item.productId,
            organizationId: sale.organizationId,
          },
          data: { quantity: { increment: item.quantity } },
        });
      }
    }

    // Si la venta cerró un pedido, revertirlo a PENDING para poder revenderlo.
    if (sale.orderId) {
      await tx.order.updateMany({
        where: { id: sale.orderId },
        data: { status: "PENDING" },
      });
    }
  });

  // El conteo de pendientes pudo subir (order revertida a PENDING) → señal de
  // tiempo real para refetchear. Try/catch: un fallo del socket NO debe
  // afectar la venta ya commiteada.
  if (sale.orderId) {
    try {
      emitOrdersChanged(organizationId);
    } catch (socketError: any) {
      console.error(
        `[salesService.deleteSale] emitOrdersChanged falló (order=${sale.orderId}):`,
        socketError?.message ?? socketError,
      );
    }
  }

  return { message: "Venta eliminada correctamente" };
};

export default {
  createSale,
  getAllSales,
  getSaleById,
  deleteSale,
};

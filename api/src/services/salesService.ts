import { prisma, basePrisma } from "../config/db";
import { requireOrganizationId } from "../config/tenantContext";
import { sendMail } from "./mailService";
import { saleConfirmedEmail } from "./mailTemplates";
import { emitOrdersChanged } from "../realtime/socket";
import { round2 } from "../utils/money";
import { computePerUnitPrice } from "../utils/unitsPerBox";
import { resolveCellForProduct, looseLineName, CellWithNames } from "./looseSaleService";

interface IProductSale {
  productId?: string;
  name?: string;
  // Venta suelta desde la planilla (sdd/loose-lines-stock): id de la celda
  // PriceKgPrice que se vende. Sin productId físico (productId null en la DB).
  loosePriceId?: string;
  // Nombre de la línea suelta que manda el front (fallback: "MARCA · TIPO").
  looseName?: string;
  quantity: number;
  category?: string;
  price: number;
  // Modo de venta del renglón (sdd/venta-alimento-suelto B-08): ausente =
  // legacy BOLSA_CERRADA (el schema lo normaliza con .default()).
  // POR_UNIDAD (sdd/venta-por-unidad-multpack): línea de un multi-pack vendida
  // por unidad; el precio lo recomputa el server (round2(price/unitsPerBox)).
  saleMode?: "BOLSA_CERRADA" | "POR_PESO" | "POR_MONTO" | "POR_UNIDAD";
}

interface ISaleRequest {
  products: IProductSale[];
  // Opcional: pedido de la tienda online que esta venta procesa. Si viene, la
  // Order se cierra (COMPLETED), se enlaza a la Sale y se manda mail al cliente.
  orderId?: string;
  // Desglose de medios de pago (sdd/caja-apertura-cierre R6/R7). Opcional:
  // ventas legacy/admin sin payments siguen funcionando. Σ payments == total
  // se valida server-side con round2.
  payments?: { method: string; amount: number }[];
  // Sesión de caja a la que se asocia la venta (R8). Para VENDEDOR/CASHIER el
  // server la resuelve de la sesión OPEN; para gestión se acepta del request.
  cashSessionId?: string;
  // Descuento porcentual a nivel venta (sdd/venta-descuento): 0..100. Ausente
  // = 0 = sin descuento (backward-compat). El server materializa el monto en $
  // (discount) y repondera totalAmount = subtotal − discount.
  discountPct?: number;
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

  // ── Cash session gate (sdd/caja-apertura-cierre R9) ──
  // VENDEDOR/CASHIER necesitan una caja OPEN en su sucursal para vender. La
  // sesión abierta se resuelve ACÁ (fuera de la transacción) y se usa para
  // setear Sale.cashSessionId + SalePayment.cashSessionId (R8). ADMIN/
  // MANAGEMENT (y roles sin sucursal) quedan eximidos: venden sin cashSessionId
  // (backward-compat) o con el cashSessionId explícito del request.
  let resolvedCashSessionId: string | null = null;
  if (sellerBranchId && userId && (role === "VENDEDOR" || role === "CASHIER")) {
    // Caja compartida por sucursal: se vende en la caja OPEN de la sucursal,
    // sin importar quién la abrió (cashierId es auditoría, no gate).
    const openSession = await prisma.cashSession.findFirst({
      where: { branchId: sellerBranchId, status: "OPEN" },
      select: { id: true },
    });
    if (!openSession) {
      const err: any = new Error(
        "Necesitás una caja abierta en tu sucursal para poder vender.",
      );
      err.code = "CASH_SESSION_REQUIRED";
      throw err;
    }
    resolvedCashSessionId = openSession.id;
  } else if (saleRequest.cashSessionId) {
    resolvedCashSessionId = saleRequest.cashSessionId;
  }

  // ── Transaction ──
  const sale = await prisma.$transaction(async (tx) => {
    let totalAmount = 0;
    const saleItems: {
      productId: string | null;
      loosePriceId: string | null;
      name: string;
      quantity: number;
      category: string;
      price: number;
      saleMode: "BOLSA_CERRADA" | "POR_PESO" | "POR_MONTO" | "POR_UNIDAD";
    }[] = [];

    for (const item of saleRequest.products) {
      if (!item.productId && !item.loosePriceId) {
        throw new Error("Faltan campos requeridos en un producto de la venta");
      }

      // B-06: la cantidad puede ser decimal (kg / monto). Number() en lugar de
      // parseInt (que truncaba los kg sueltos): el schema ya validó la forma.
      const quantity = Number(String(item.quantity));
      const price = parseFloat(String(item.price));
      const saleMode: "BOLSA_CERRADA" | "POR_PESO" | "POR_MONTO" | "POR_UNIDAD" =
        item.saleMode ?? "BOLSA_CERRADA";
      const isLoose = saleMode === "POR_PESO" || saleMode === "POR_MONTO";

      // El producto físico es OPCIONAL: los renglones sueltos desde la planilla
      // mandan loosePriceId sin productId (loose-lines-stock).
      const product = item.productId
        ? await tx.product.findFirst({
            where: { id: item.productId, organizationId },
            include: { category: true },
          })
        : null;
      if (item.productId && !product) {
        throw new Error(`Producto ${item.productId} no encontrado`);
      }

      // ── Resolución de celda + gate de sucursal (modos sueltos) ──
      // La venta suelta NO descuenta del producto físico: descuenta los kg del
      // LooseStock de la celda de la planilla (sdd/loose-lines-stock). La celda
      // se resuelve por loosePriceId (panel de planilla) o, backwards-compat,
      // por productId (matching del nombre contra la planilla).
      let cell: CellWithNames | null = null;
      if (isLoose) {
        if (item.loosePriceId) {
          cell = (await tx.priceKgPrice.findFirst({
            where: { id: item.loosePriceId, organizationId },
            include: {
              brand: { select: { name: true } },
              type: { select: { name: true } },
            },
          })) as CellWithNames | null;
        } else if (item.productId) {
          cell = await resolveCellForProduct(tx, organizationId, item.productId);
        }
        if (!cell) {
          const err: any = new Error(
            "El producto no tiene una línea (celda) de la planilla para venta suelta",
          );
          err.code = "LOOSE_LINE_NOT_FOUND";
          throw err;
        }
        if (!sellerBranchId) {
          // B-06 amendment: el stock suelto fraccionario solo se puede
          // bookkeepear en LooseStock (sucursal); sin sucursal no hay dónde
          // descontar los kg.
          const err: any = new Error(
            "Las ventas sueltas requieren una sucursal asignada (el stock suelto se descuenta de la sucursal)",
          );
          err.code = "LOOSE_REQUIRES_BRANCH";
          throw err;
        }
      }

      // ── Resolución de cantidad y precio por modo ──
      // BOLSA_CERRADA / POR_PESO: la cantidad ya es la unidad final (bolsas /
      // kg) y el precio es el unitario (para sueltos, el front manda el precio
      // de la celda como price). POR_MONTO: el cliente manda el MONTO en
      // quantity; el server convierte de forma autoritativa (B-07) y guarda el
      // snapshot del precio unitario para que kg × precio reproduzca el total
      // exactamente.
      let lineQuantity = quantity;
      let linePrice = price;
      if (saleMode === "POR_MONTO") {
        // C-05: el precio unitario es el de la CELDA de la planilla (viene en
        // el payload como price). Fallback al priceKgSuelto almacenado o al
        // priceKg de la celda SOLO si el payload no trae price (backwards
        // compat para callers legados).
        const unitPrice =
          price || cell?.priceKg || (product?.priceKgSuelto as number) || 0;
        if (!(unitPrice > 0)) {
          const err: any = new Error(
            "No hay precio por kg para convertir el monto en kilogramos",
          );
          err.code = "LOOSE_LINE_NOT_FOUND";
          throw err;
        }
        // kg = amount ÷ unitPrice. El kg se usa SOLO para descontar stock suelto
        // (LooseStock); NO define el total de la línea. El monto declarado es
        // autoritativo: "por monto" es ese monto, sin recalcular desde el kg.
        lineQuantity = quantity / unitPrice; // kg = amount ÷ unitPrice (stock)
        linePrice = unitPrice; // snapshot congelado (B-04)
      }

      // POR_UNIDAD (sdd/venta-por-unidad-multpack): multi-pack vendido por
      // unidad. El precio por unidad lo RECOMPUTA el server (box anchor gana):
      // round2(product.price / unitsPerBox). Jamás confiamos en el price del
      // cliente (evita drift de rounding contra la caja). Se exige que el
      // producto exista y que unitsPerBox > 1 y no null.
      if (saleMode === "POR_UNIDAD") {
        if (!product) {
          throw new Error(
            "La venta por unidad requiere un producto",
          );
        }
        const unitsPerBox = product.unitsPerBox as number | null | undefined;
        const perUnitPrice = computePerUnitPrice(Number(product.price), unitsPerBox);
        if (unitsPerBox === null || unitsPerBox === undefined || unitsPerBox <= 1 || perUnitPrice === null) {
          throw new Error(
            `El producto "${product.name}" no se puede vender por unidad (unitsPerBox debe ser mayor a 1)`,
          );
        }
        linePrice = perUnitPrice; // server-authoritative
      }

      const lineName = isLoose
        ? item.looseName ??
          looseLineName(cell?.brand?.name ?? "", cell?.type?.name ?? "")
        : product!.name;

      // ── Deducción de stock según el pool correcto ──
      // Stock en UNIDADES (sdd/venta-por-unidad-multpack). Para un multi-pack
      // (unitsPerBox > 1): la caja (BOLSA_CERRADA) descuenta qty × unitsPerBox;
      // la unidad (POR_UNIDAD) descuenta qty × 1. Para un producto legacy sin
      // unitsPerBox la caja sigue descontando 1 por bolsa (cajaMultiplier = 1).
      const cajaMultiplier =
        product?.unitsPerBox && product.unitsPerBox > 1 ? product.unitsPerBox : 1;
      const stockUnits =
        saleMode === "BOLSA_CERRADA" ? lineQuantity * cajaMultiplier : lineQuantity;
      if (isLoose && cell) {
        // Ventas sueltas: descuentan kg del LooseStock de la celda (la bolsa
        // física ya se abrió con openBag y su peso quedó acreditado acá).
        const kg = lineQuantity;
        const looseStock = await tx.looseStock.findFirst({
          where: {
            priceKgPriceId: cell.id,
            branchId: sellerBranchId!,
            organizationId,
          },
        });
        if (!looseStock || looseStock.quantity < kg) {
          throw new Error(
            `Stock suelto insuficiente de "${lineName}" en tu sucursal`,
          );
        }
        const updated = await tx.looseStock.updateMany({
          where: {
            priceKgPriceId: cell.id,
            branchId: sellerBranchId!,
            organizationId,
            quantity: { gte: kg },
          },
          data: { quantity: { decrement: kg } },
        });
        if (updated.count === 0) {
          throw new Error(
            `Stock suelto insuficiente de "${lineName}" en tu sucursal`,
          );
        }
      } else if (sellerBranchId) {
        // BOLSA_CERRADA scoped a sucursal: el stock de bolsas volvió a UNIDADES
        // (backfill reverse en 20260817120000_loose_lines_stock) — la bolsa
        // cerrada descuenta 1 por bolsa, el suelto va por LooseStock.
        const stock = await tx.productStock.findFirst({
          where: {
            productId: product!.id,
            branchId: sellerBranchId,
            organizationId,
          },
        });
        if (!stock || stock.quantity < stockUnits) {
          throw new Error(
            `Stock insuficiente de "${product!.name}" en tu sucursal`,
          );
        }

        const updated = await tx.productStock.updateMany({
          where: {
            productId: product!.id,
            branchId: sellerBranchId,
            organizationId,
            quantity: { gte: stockUnits },
          },
          data: { quantity: { decrement: stockUnits } },
        });
        if (updated.count === 0) {
          throw new Error(
            `Stock insuficiente de "${product!.name}" en tu sucursal`,
          );
        }
      } else {
        // ── Legacy / admin sale: deduct from product.quantity (HQ global) ──
        if (product!.quantity < stockUnits) {
          throw new Error(
            `Stock insuficiente para el producto ${product!.name}`,
          );
        }

        const updated = await tx.product.updateMany({
          where: {
            id: product!.id,
            organizationId,
            quantity: { gte: stockUnits },
          },
          data: { quantity: { decrement: stockUnits } },
        });
        if (updated.count === 0) {
          throw new Error(
            `Stock insuficiente para el producto ${product!.name}`,
          );
        }
      }

      // Per-line total: POR_MONTO usa el MONTO declarado (autoritativo, no se
      // recalcula desde el kg); BOLSA/POR_PESO usan kg × unitPrice con round2.
      const lineTotal =
        saleMode === "POR_MONTO"
          ? round2(quantity) // "por monto" = el monto, sin cálculo
          : round2(lineQuantity * linePrice);
      saleItems.push({
        productId: isLoose ? null : product!.id,
        loosePriceId: isLoose && cell ? cell.id : null,
        name: lineName,
        quantity: lineQuantity,
        category: product?.category?.name ?? "Sin categoría",
        price: linePrice,
        saleMode,
      });
      totalAmount += lineTotal;
    }

    // ── Descuento porcentual a nivel venta (sdd/venta-descuento) ──
    // El vendedor ingresa un % (0..100); el server materializa el monto en $
    // con round2 y repondera totalAmount al valor FINAL (ya descontado). Se
    // calcula acá (sobre el subtotal de items) para que la validación de
    // payments (Σ == total) y la persistencia usen el total descontado.
    const discountPct = Math.min(100, Math.max(0, saleRequest.discountPct ?? 0));
    const discountAmount = round2((totalAmount * discountPct) / 100);
    totalAmount = round2(totalAmount - discountAmount);

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

    // ── Payments sum == total (sdd/caja-apertura-cierre R6/R7) ──
    // Nunca se confía en un total enviado por el cliente: la suma de los
    // payments se compara contra el totalAmount calculado server-side con
    // round2 (tolerancia de centavos). Payments opcionales → backward-compat.
    const payments = saleRequest.payments ?? [];
    if (payments.length > 0) {
      const declaredSum = round2(
        payments.reduce((acc, p) => acc + round2(p.amount), 0),
      );
      if (declaredSum !== round2(totalAmount)) {
        const err: any = new Error(
          "La suma de los medios de pago no coincide con el total de la venta",
        );
        err.code = "PAYMENTS_DO_NOT_MATCH_TOTAL";
        throw err;
      }
    }

    const created = await tx.sale.create({
      data: {
        organizationId,
        totalAmount,
        discount: discountAmount,
        ...(sellerBranchId ? { branchId: sellerBranchId } : {}),
        ...(orderId ? { orderId } : {}),
        // Venta asociada a la caja abierta (R8); null en ventas legacy/admin.
        ...(resolvedCashSessionId ? { cashSessionId: resolvedCashSessionId } : {}),
        items: { create: saleItems },
        // Desglose de medios de pago (R6-R8). Cada SalePayment lleva la
        // cashSessionId de la venta.
        ...(payments.length > 0
          ? {
              payments: {
                create: payments.map((p) => ({
                  method: p.method as any,
                  amount: p.amount,
                  cashSessionId: resolvedCashSessionId ?? undefined,
                })),
              },
            }
          : {}),
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
      // Desglose de medios de pago de la venta (R6/R7, sdd/caja-apertura-cierre).
      // El front lo usa para el dashboard "Ventas por medio de pago".
      payments: true,
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
      // Venta scoped a sucursal → reponer el pool correcto por renglón:
      // sueltos (loosePriceId) → LooseStock (kg de la celda); bolsas →
      // ProductStock (unidades de bolsa).
      for (const item of sale.items) {
        if (item.loosePriceId) {
          await tx.looseStock.updateMany({
            where: {
              priceKgPriceId: item.loosePriceId,
              branchId: sale.branchId,
              organizationId: sale.organizationId,
            },
            data: { quantity: { increment: item.quantity } },
          });
        } else if (item.productId) {
          await tx.productStock.updateMany({
            where: {
              productId: item.productId,
              branchId: sale.branchId,
              organizationId: sale.organizationId,
            },
            data: { quantity: { increment: item.quantity } },
          });
        }
      }
    } else {
      // Venta legacy / admin → reponer Product.quantity (stock global).
      for (const item of sale.items) {
        if (item.productId) {
          await tx.product.updateMany({
            where: {
              id: item.productId,
              organizationId: sale.organizationId,
            },
            data: { quantity: { increment: item.quantity } },
          });
        }
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

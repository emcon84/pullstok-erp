import { Request, Response } from "express";
import { prisma, basePrisma } from "../config/db";
import { requireOrganizationId } from "../config/tenantContext";
import { AuthedRequest } from "../middlewares/authMiddleware";
import {
  findAlimentoSecoCategoryIds,
  matchProductsForCell,
  autoApply as runAutoApply,
} from "../services/priceMatchingService";

/**
 * Cola de revisión de precios por kilo. Cada entrada es un hallazgo del
 * auto-apply (matching difuso, manual protegido, marca sin planilla o celda
 * huérfana) que un ADMIN aprueba o rechaza. Aprobar aplica el precio de la
 * celda (newPriceKg) al producto SIN tocar priceKgSueltoManual: la protección
 * de manuales vive en el auto-apply, no acá.
 *
 * Tenant-scoped igual que priceKgPlanController: dentro del $transaction el tx
 * NO hereda el scope automático → organizationId EXPLÍCITO en toda query.
 */

const queueInclude = {
  product: { select: { name: true } },
  priceKgPrice: {
    include: {
      brand: { select: { name: true } },
      type: { select: { name: true } },
    },
  },
} as const;

const toQueueItem = (e: any) => ({
  id: e.id,
  productId: e.productId,
  productName: e.product?.name ?? null,
  priceKgPriceId: e.priceKgPriceId,
  brandName: e.priceKgPrice?.brand?.name ?? null,
  typeName: e.priceKgPrice?.type?.name ?? null,
  species: e.species,
  reason: e.reason,
  status: e.status,
  oldPriceKg: e.oldPriceKg,
  newPriceKg: e.newPriceKg,
  reviewedBy: e.reviewedBy,
  appliedAt: e.appliedAt,
  createdAt: e.createdAt,
});

const notFound = (res: Response) =>
  res.status(404).json({ message: "Entrada no encontrada o ya revisada" });

const serverError = (res: Response, error: any, ctx: string) => {
  console.error(`Error en ${ctx}:`, error);
  return res.status(500).json({ message: "Error interno del servidor" });
};

export const listQueue = async (req: Request, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const { status, reason } = req.query as {
      status?: "PENDING" | "APPROVED" | "REJECTED";
      reason?: "FUZZY_MATCH" | "MANUAL_OVERRIDE" | "ORPHAN_CELL" | "BRAND_NO_PLANILLA";
    };
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(String(req.query.limit ?? "20"), 10) || 20),
    );
    const where = {
      ...(status ? { status } : {}),
      ...(reason ? { reason } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.reviewQueueEntry.findMany({
        where,
        include: queueInclude,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.reviewQueueEntry.count({ where }),
    ]);

    return res.status(200).json({
      items: items.map(toQueueItem),
      total,
      page,
    });
  } catch (error: any) {
    return serverError(res, error, "listQueue");
  }
};

export const autoApply = async (_req: Request, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const result = await prisma.$transaction((tx) => runAutoApply(tx, organizationId));
    return res.status(200).json(result);
  } catch (error: any) {
    return serverError(res, error, "autoApply");
  }
};

export const approveEntry = async (req: Request, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const id = String(req.params.id ?? "");
    const userId = (req as AuthedRequest).user?.id ?? null;

    await prisma.$transaction(async (tx) => {
      const entry = await tx.reviewQueueEntry.findFirst({
        where: { id, organizationId, status: "PENDING" },
      });
      if (!entry) {
        throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" });
      }
      // Aplica el precio de la celda al producto; entries sin precio (p.ej.
      // BRAND_NO_PLANILLA) solo se marcan como revisadas.
      if (entry.productId && entry.newPriceKg !== null) {
        await tx.product.updateMany({
          where: { id: entry.productId, organizationId },
          data: { priceKgSuelto: entry.newPriceKg },
        });
      }
      await tx.reviewQueueEntry.updateMany({
        where: { id, organizationId },
        data: { status: "APPROVED", appliedAt: new Date(), reviewedBy: userId },
      });
    });

    return res.status(200).json({ success: true });
  } catch (error: any) {
    if (error?.code === "NOT_FOUND") {
      return notFound(res);
    }
    return serverError(res, error, "approveEntry");
  }
};

export const rejectEntry = async (req: Request, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const id = String(req.params.id ?? "");
    const userId = (req as AuthedRequest).user?.id ?? null;

    await prisma.$transaction(async (tx) => {
      const entry = await tx.reviewQueueEntry.findFirst({
        where: { id, organizationId, status: "PENDING" },
      });
      if (!entry) {
        throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" });
      }
      // Solo cambia el estado: el precio del producto queda intacto.
      await tx.reviewQueueEntry.updateMany({
        where: { id, organizationId },
        data: { status: "REJECTED", reviewedBy: userId },
      });
    });

    return res.status(200).json({ success: true });
  } catch (error: any) {
    if (error?.code === "NOT_FOUND") {
      return notFound(res);
    }
    return serverError(res, error, "rejectEntry");
  }
};

export const listProductsForCell = async (req: Request, res: Response) => {
  try {
    const organizationId = requireOrganizationId();
    const brandId = String(req.query.brandId ?? "");
    const typeId = String(req.query.typeId ?? "");
    const species = String(req.query.species ?? "") as "PERRO" | "GATO" | "AMBOS";
    if (
      !brandId ||
      !typeId ||
      !["PERRO", "GATO", "AMBOS"].includes(species)
    ) {
      return res
        .status(400)
        .json({ message: "brandId, typeId y species son requeridos" });
    }

    // Stock por sucursal solo cuando el vendedor tiene exactamente una (mismo
    // criterio que salesService); ADMIN/MANAGEMENT → stock legacy quantity.
    const user = (req as AuthedRequest).user;
    let sellerBranchId: string | null = null;
    if (user?.id && (user.role === "VENDEDOR" || user.role === "CASHIER")) {
      const assignments = await basePrisma.branchAssignment.findMany({
        where: { userId: user.id },
        select: { branchId: true },
      });
      if (assignments.length === 1) {
        sellerBranchId = assignments[0].branchId;
      }
    }

    const categories = await prisma.category.findMany({
      where: { organizationId },
      select: { id: true, name: true, parentId: true },
    });
    const secoIds = findAlimentoSecoCategoryIds(categories);

    const [brands, types, products] = await Promise.all([
      prisma.priceKgBrand.findMany({
        where: { organizationId },
        select: { id: true, name: true, keywords: true },
      }),
      prisma.priceKgType.findMany({
        where: { organizationId },
        select: { id: true, name: true, synonyms: true },
      }),
      prisma.product.findMany({
        where: { organizationId, categoryId: { in: secoIds } },
        select: {
          id: true,
          name: true,
          categoryId: true,
          weightKg: true,
          priceKgSuelto: true,
          quantity: true,
          category: { select: { name: true } },
        },
      }),
    ]);

    const matched = matchProductsForCell(
      products,
      brands,
      types,
      categories,
      { brandId, typeId, species },
    );
    const ids = matched.map((m) => m.product.id);

    let stockByProduct = new Map<string, number>();
    if (sellerBranchId && ids.length > 0) {
      const stocks = await prisma.productStock.findMany({
        where: {
          productId: { in: ids },
          branchId: sellerBranchId,
          organizationId,
        },
        select: { productId: true, quantity: true },
      });
      stockByProduct = new Map(stocks.map((s) => [s.productId, s.quantity]));
    }

    return res.status(200).json(
      matched.map((m) => ({
        id: m.product.id,
        name: m.product.name,
        weightKg: m.product.weightKg ?? null,
        stock: sellerBranchId
          ? stockByProduct.get(m.product.id) ?? 0
          : Number(m.product.quantity ?? 0),
        priceKgSuelto: m.product.priceKgSuelto ?? null,
        category: (m.product as any).category?.name ?? "",
        exact: m.exact,
      })),
    );
  } catch (error: any) {
    return serverError(res, error, "listProductsForCell");
  }
};

const priceKgReviewController = {
  listQueue,
  autoApply,
  approveEntry,
  rejectEntry,
  listProductsForCell,
};
export default priceKgReviewController;

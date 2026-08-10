import type { PrismaClient } from "@prisma/client";
import { prisma } from "../config/db";

/** Stock agregado de una sucursal ACTIVA dentro del resumen de la org. */
export interface StockSummaryBranch {
  branchId: string;
  branchName: string;
  quantity: number;
  isHeadquarters: boolean;
}

/** Resumen de stock de TODA la org (dashboard): total + detalle por sucursal. */
export interface StockSummary {
  total: number;
  branches: StockSummaryBranch[];
}

/**
 * Whether a user with the given role may edit the stock of a specific branch.
 * Pure helper (no DB): the caller reads the user's BranchAssignment and passes
 * the resulting branchIds. ADMIN/MANAGEMENT can edit any branch; VENDEDOR and
 * CASHIER only their assigned ones (null/empty = read-only); everyone else
 * never edits (spec A2).
 */
export const canEditBranchStock = (
  role: string,
  branchIds: string[] | null,
  targetBranchId: string,
): boolean => {
  if (role === "ADMIN" || role === "MANAGEMENT") return true;
  if (role === "VENDEDOR" || role === "CASHIER") {
    return Array.isArray(branchIds) && branchIds.includes(targetBranchId);
  }
  return false;
};

/**
 * Resolves which branch's stock the storefront must read (spec S1): the
 * configured store branch wins; otherwise the headquarters branch; null when
 * neither exists (caller decides the fallback). Pure helper (no DB).
 */
export const resolveEffectiveBranch = (
  settingsStoreBranchId: string | null,
  hqBranchId: string | null,
): string | null => settingsStoreBranchId ?? hqBranchId;

/**
 * Keeps ProductStock(HQ) and the legacy Product.quantity in sync (spec D4).
 *
 * Runs in a $transaction: finds the org's HQ branch, upserts the ProductStock
 * row for it (findFirst + updateMany/create — NEVER findUnique/upsert, tenant
 * pattern of db.ts), and mirrors the value into Product.quantity. If the org
 * has no HQ branch, nothing is touched (Product.quantity stays as-is).
 *
 * `client` is injectable: request handlers run inside the tenant scope and
 * use `prisma` (default), while the CSV importer (which runs inside a stream
 * callback, outside AsyncLocalStorage) passes `basePrisma` plus the explicit
 * organizationId in every query.
 */
export const syncHqStock = async (
  orgId: string,
  productId: string,
  quantity: number,
  // `prisma` (extended, tenant scope) y `basePrisma` (CSV importer, fuera de
  // ALS) tienen el MISMO runtime para $transaction; el cast solo reconcilia el
  // tipo extendido (con extensiones tipadas) con el tipo base de Prisma.
  client: PrismaClient = prisma as unknown as PrismaClient,
): Promise<void> => {
  await client.$transaction(async (tx) => {
    const hq = await tx.branch.findFirst({
      where: { organizationId: orgId, isHeadquarters: true },
      select: { id: true },
    });
    if (!hq) return;

    const existing = await tx.productStock.findFirst({
      where: { productId, branchId: hq.id, organizationId: orgId },
    });

    if (existing) {
      await tx.productStock.updateMany({
        where: { productId, branchId: hq.id, organizationId: orgId },
        data: { quantity },
      });
    } else {
      await tx.productStock.create({
        data: { productId, branchId: hq.id, quantity, organizationId: orgId },
      });
    }

    await tx.product.updateMany({
      where: { id: productId, organizationId: orgId },
      // B-06: ProductStock.quantity es Float (kg fraccionarios), pero
      // Product.quantity (legacy casa central) SIGUE Int → mirror con
      // Math.round (la fracción no se puede representar en la columna Int).
      data: { quantity: Math.round(quantity) },
    });
  });
};

/**
 * Stock summary de la org (dashboard): `total` = suma de TODOS los
 * ProductStock de la org (incluye sucursales inactivas — el total es el
 * inventario real), y `branches` = SOLO sucursales activas con la suma de su
 * stock (0 si no tienen filas). Agrupa con groupBy (soportado por la
 * extension de db.ts: inyecta organizationId en el where) y siempre scopa por
 * organizationId explícito (patrón tenant del repo).
 */
export const getStockSummary = async (orgId: string): Promise<StockSummary> => {
  const [stockGroups, branches] = await Promise.all([
    prisma.productStock.groupBy({
      by: ["branchId"],
      where: { organizationId: orgId },
      _sum: { quantity: true },
    }),
    prisma.branch.findMany({
      where: { organizationId: orgId, isActive: true },
      select: { id: true, name: true, isHeadquarters: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const stockByBranch = new Map(
    stockGroups.map((g) => [g.branchId, g._sum.quantity ?? 0]),
  );

  return {
    total: stockGroups.reduce(
      (sum, g) => sum + (g._sum.quantity ?? 0),
      0,
    ),
    branches: branches.map((b) => ({
      branchId: b.id,
      branchName: b.name,
      quantity: stockByBranch.get(b.id) ?? 0,
      isHeadquarters: b.isHeadquarters,
    })),
  };
};

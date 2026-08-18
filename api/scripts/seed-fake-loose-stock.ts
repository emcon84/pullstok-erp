/**
 * Seed de stock ficticio para probar la venta suelta sin cargar nada a mano.
 *
 * Para cada organización con planilla de precios sueltos activa:
 *   1. Crea/actualiza LooseStock ficticio (kg) para cada (celda PriceKgPrice,
 *      sucursal) donde la fila no exista o tenga quantity <= 0. NUNCA pisa
 *      stock real > 0.
 *   2. Con `--with-bags`: fija ProductStock ficticio (bolsas) para cada
 *      producto suelto (el que matchea una celda) × sucursal, con la misma
 *      regla de no pisar stock real > 0.
 *
 * Idempotente: correrlo dos veces no duplica ni pisa stock real.
 *
 * Env (opcional):
 *   FAKE_KG   = kg ficticios por (celda, sucursal)   [default 20]
 *   FAKE_BAGS = bolsas ficticias por (producto, sucursal) [default 10]
 *
 * Usage: npx ts-node scripts/seed-fake-loose-stock.ts [--with-bags]
 */
import "dotenv/config";
import { basePrisma } from "../src/config/db";
import { findCellForProduct } from "../src/services/priceMatchingService";

export const DEFAULT_FAKE_KG = 20;
export const DEFAULT_FAKE_BAGS = 10;

export const hasWithBagsFlag = (argv: string[] = process.argv): boolean =>
  argv.includes("--with-bags");

export const resolveFakeKg = (env: NodeJS.ProcessEnv = process.env): number => {
  const v = Number(env.FAKE_KG);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_FAKE_KG;
};

export const resolveFakeBags = (env: NodeJS.ProcessEnv = process.env): number => {
  const v = Number(env.FAKE_BAGS);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_FAKE_BAGS;
};

export interface LooseCellLike {
  id: string;
  priceKg: number;
}

export interface BranchLike {
  id: string;
}

export interface ExistingLooseStockLike {
  id: string;
  priceKgPriceId: string;
  branchId: string;
  quantity: number;
}

export interface PlannedLooseStockRow {
  kind: "create" | "update";
  existingId: string | null;
  priceKgPriceId: string;
  branchId: string;
  quantity: number;
}

/**
 * Planifica las filas LooseStock a crear/actualizar (celda × sucursal):
 * faltante → create; existente con quantity <= 0 → update; existente con
 * quantity > 0 → se ignora (nunca se pisa stock real). Función pura.
 */
export const planLooseStockCreations = (
  cells: LooseCellLike[],
  branches: BranchLike[],
  existing: ExistingLooseStockLike[],
  defaultKg: number,
): PlannedLooseStockRow[] => {
  const byKey = new Map(
    existing.map((e) => [`${e.priceKgPriceId}|${e.branchId}`, e]),
  );
  const rows: PlannedLooseStockRow[] = [];
  for (const cell of cells) {
    if (!(cell.priceKg > 0)) continue;
    for (const branch of branches) {
      const key = `${cell.id}|${branch.id}`;
      const row = byKey.get(key);
      if (row && row.quantity > 0) continue;
      rows.push({
        kind: row ? "update" : "create",
        existingId: row?.id ?? null,
        priceKgPriceId: cell.id,
        branchId: branch.id,
        quantity: defaultKg,
      });
    }
  }
  return rows;
};

export interface LooseProductLike {
  id: string;
  priceKgSuelto?: number | null;
}

export interface ExistingProductStockLike {
  id: string;
  productId: string;
  branchId: string;
  quantity: number;
}

export interface PlannedProductStockRow {
  kind: "create" | "update";
  existingId: string | null;
  productId: string;
  branchId: string;
  quantity: number;
}

/**
 * Planifica las filas ProductStock de bolsas a crear/actualizar (producto
 * suelto × sucursal) con la misma regla: faltante → create; <= 0 → update;
 * > 0 → se ignora. Función pura.
 */
export const planProductStockCreations = (
  products: LooseProductLike[],
  branches: BranchLike[],
  existing: ExistingProductStockLike[],
  defaultBags: number,
): PlannedProductStockRow[] => {
  const byKey = new Map(
    existing.map((e) => [`${e.productId}|${e.branchId}`, e]),
  );
  const rows: PlannedProductStockRow[] = [];
  for (const product of products) {
    if ((product.priceKgSuelto ?? 0) <= 0) continue;
    for (const branch of branches) {
      const key = `${product.id}|${branch.id}`;
      const row = byKey.get(key);
      if (row && row.quantity > 0) continue;
      rows.push({
        kind: row ? "update" : "create",
        existingId: row?.id ?? null,
        productId: product.id,
        branchId: branch.id,
        quantity: defaultBags,
      });
    }
  }
  return rows;
};

export interface OrgStockSummary {
  organizationId: string;
  looseCreated: number;
  looseUpdated: number;
  bagsCreated: number;
  bagsUpdated: number;
}

/**
 * Seed de una organización. Usa basePrisma (sin scope tenant, operación de
 * plataforma): el organizationId se pasa EXPLÍCITO en toda query, igual que
 * migrate-branch-stock.
 */
export async function seedFakeLooseStockForOrg(
  orgId: string,
  opts: { withBags: boolean; fakeKg: number; fakeBags: number },
): Promise<OrgStockSummary> {
  const { withBags, fakeKg, fakeBags } = opts;

  const [branches, cells, existingLoose] = await Promise.all([
    basePrisma.branch.findMany({
      where: { organizationId: orgId },
      select: { id: true },
    }),
    basePrisma.priceKgPrice.findMany({
      where: { organizationId: orgId, priceKg: { gt: 0 } },
      select: { id: true, priceKg: true },
    }),
    basePrisma.looseStock.findMany({
      where: { organizationId: orgId },
      select: { id: true, priceKgPriceId: true, branchId: true, quantity: true },
    }),
  ]);

  const loosePlan = planLooseStockCreations(cells, branches, existingLoose, fakeKg);
  const looseCreates = loosePlan.filter((op) => op.kind === "create");
  const looseUpdates = loosePlan.filter((op) => op.kind === "update");

  await basePrisma.$transaction(async (tx) => {
    if (looseCreates.length > 0) {
      await tx.looseStock.createMany({
        data: looseCreates.map((op) => ({
          priceKgPriceId: op.priceKgPriceId,
          branchId: op.branchId,
          quantity: op.quantity,
          organizationId: orgId,
        })),
        skipDuplicates: true,
      });
    }
    for (const op of looseUpdates) {
      await tx.looseStock.updateMany({
        where: { id: op.existingId!, organizationId: orgId },
        data: { quantity: op.quantity },
      });
    }
  });

  let bagsCreated = 0;
  let bagsUpdated = 0;
  if (withBags) {
    const [categories, brands, types, cellKeys, looseProducts, existingStock] =
      await Promise.all([
        basePrisma.category.findMany({
          where: { organizationId: orgId },
          select: { id: true, name: true, parentId: true },
        }),
        basePrisma.priceKgBrand.findMany({
          where: { organizationId: orgId },
          select: { id: true, name: true, keywords: true },
        }),
        basePrisma.priceKgType.findMany({
          where: { organizationId: orgId },
          select: { id: true, name: true, synonyms: true },
        }),
        basePrisma.priceKgPrice.findMany({
          where: { organizationId: orgId },
          select: { id: true, brandId: true, typeId: true, species: true, priceKg: true },
        }),
        basePrisma.product.findMany({
          where: { organizationId: orgId },
          select: { id: true, name: true, categoryId: true, priceKgSuelto: true },
        }),
        basePrisma.productStock.findMany({
          where: { organizationId: orgId },
          select: { id: true, productId: true, branchId: true, quantity: true },
        }),
      ]);

    // Solo productos sueltos que matchean una celda de la planilla (el motor
    // de matching de priceMatchingService, sin DB).
    const categoryById = new Map(categories.map((c) => [c.id, c]));
    const productsWithCell = looseProducts.filter(
      (p) => findCellForProduct(p, brands, types, categoryById, cellKeys).cell !== null,
    );

    const bagPlan = planProductStockCreations(
      productsWithCell,
      branches,
      existingStock,
      fakeBags,
    );
    const bagCreates = bagPlan.filter((op) => op.kind === "create");
    const bagUpdates = bagPlan.filter((op) => op.kind === "update");

    await basePrisma.$transaction(async (tx) => {
      if (bagCreates.length > 0) {
        await tx.productStock.createMany({
          data: bagCreates.map((op) => ({
            productId: op.productId,
            branchId: op.branchId,
            quantity: op.quantity,
            organizationId: orgId,
          })),
          skipDuplicates: true,
        });
      }
      for (const op of bagUpdates) {
        await tx.productStock.updateMany({
          where: { id: op.existingId!, organizationId: orgId },
          data: { quantity: op.quantity },
        });
      }
    });

    bagsCreated = bagCreates.length;
    bagsUpdated = bagUpdates.length;
  }

  return {
    organizationId: orgId,
    looseCreated: looseCreates.length,
    looseUpdated: looseUpdates.length,
    bagsCreated,
    bagsUpdated,
  };
}

async function main() {
  const withBags = hasWithBagsFlag();
  const fakeKg = resolveFakeKg();
  const fakeBags = resolveFakeBags();

  console.log(
    `Seed de stock ficticio suelto (FAKE_KG=${fakeKg}, FAKE_BAGS=${fakeBags}` +
      `${withBags ? ", --with-bags activo" : ""})...\n`,
  );

  const orgs = await basePrisma.organization.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  let totalLooseCreated = 0;
  let totalLooseUpdated = 0;
  let totalBagsCreated = 0;
  let totalBagsUpdated = 0;

  for (const org of orgs) {
    const r = await seedFakeLooseStockForOrg(org.id, { withBags, fakeKg, fakeBags });
    totalLooseCreated += r.looseCreated;
    totalLooseUpdated += r.looseUpdated;
    totalBagsCreated += r.bagsCreated;
    totalBagsUpdated += r.bagsUpdated;

    const parts = [`LooseStock: ${r.looseCreated} creados, ${r.looseUpdated} actualizados`];
    if (withBags) {
      parts.push(`ProductStock: ${r.bagsCreated} creados, ${r.bagsUpdated} actualizados`);
    }
    console.log(`[${org.name}] ${parts.join(" · ")}`);
  }

  const summary = [`LooseStock: ${totalLooseCreated} creados, ${totalLooseUpdated} actualizados`];
  if (withBags) {
    summary.push(`ProductStock: ${totalBagsCreated} creados, ${totalBagsUpdated} actualizados`);
  }
  console.log(`\nResumen: ${summary.join(" · ")}.`);
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error("FATAL:", err);
      process.exit(1);
    })
    .finally(async () => {
      await basePrisma.$disconnect();
    });
}

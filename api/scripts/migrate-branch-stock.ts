/**
 * One-time data migration for the "stock por sucursal" change.
 *
 * For every organization with products:
 *   1. Ensures exactly one headquarters branch exists (isHeadquarters=true),
 *      reusing an existing flagged branch, else an existing "Casa Central"
 *      branch (flag is set on it), else creating "Casa Central".
 *   2. Creates ProductStock rows for the HQ branch with quantity = the
 *      product's global quantity (Product.quantity). Idempotent: re-running
 *      skips products that already have an HQ row (unique constraint
 *      productId + branchId) and never alters existing values.
 *   3. Does NOT touch non-HQ branches: their stock stays at implicit zero.
 *   4. Verifies Σ(ProductStock HQ) == Σ(Product.quantity) per org.
 *
 * ⚠️  REQUIERE BACKUP PREVIO. Corré:
 *       pg_dump "$DATABASE_URL" > backup.sql
 *     o usá el endpoint existente GET /api/backups (ADMIN).
 *
 * Usage: npx ts-node scripts/migrate-branch-stock.ts
 */
import "dotenv/config";
import { basePrisma } from "../src/config/db";

export const HEADQUARTERS_BRANCH_NAME = "Casa Central";

export interface StockProduct {
  id: string;
  quantity: number;
}

export interface BranchLike {
  id: string;
  name: string;
  isHeadquarters: boolean;
}

/**
 * Picks the headquarters branch of an org: the one flagged isHeadquarters
 * wins; otherwise the branch named "Casa Central"; otherwise null (caller
 * must create it). Pure function — no DB access.
 */
export function resolveHqBranch(branches: BranchLike[]): BranchLike | null {
  return (
    branches.find((b) => b.isHeadquarters) ??
    branches.find((b) => b.name === HEADQUARTERS_BRANCH_NAME) ??
    null
  );
}

/**
 * Products that still need an HQ ProductStock row (idempotency: re-run only
 * creates the missing ones, never duplicates). Pure function.
 */
export function planHqStockCreations(
  products: StockProduct[],
  existingProductIds: Set<string>,
): StockProduct[] {
  return products.filter((p) => !existingProductIds.has(p.id));
}

/**
 * Σ(ProductStock HQ) must equal Σ(Product.quantity). Pure function.
 */
export function verifyHqStockSum(
  products: StockProduct[],
  hqStocks: StockProduct[],
): boolean {
  const productSum = products.reduce((acc, p) => acc + p.quantity, 0);
  const stockSum = hqStocks.reduce((acc, s) => acc + s.quantity, 0);
  return productSum === stockSum;
}

export interface MigrationSummary {
  organizationId: string;
  headquartersBranchId: string | null;
  migrated: number; // ProductStock rows created now
  skipped: number; // products that already had an HQ row
  verified: boolean; // Σ(ProductStock HQ) == Σ(Product.quantity)
}

/**
 * Migrates a single organization. Idempotent and safe to re-run.
 * Uses basePrisma (no tenant scope): this is a platform-level operation.
 */
export async function migrateOrganizationStock(
  orgId: string,
): Promise<MigrationSummary> {
  return basePrisma.$transaction(async (tx) => {
    // 1. Ensure the headquarters branch exists (flag wins, then name, then create)
    const branches = await tx.branch.findMany({
      where: { organizationId: orgId },
      select: { id: true, name: true, isHeadquarters: true },
    });

    let hq = resolveHqBranch(branches);
    if (!hq) {
      hq = await tx.branch.create({
        data: {
          name: HEADQUARTERS_BRANCH_NAME,
          isHeadquarters: true,
          organizationId: orgId,
        },
      });
    } else if (!hq.isHeadquarters) {
      // Existing "Casa Central" without the flag → promote it
      await tx.branch.updateMany({
        where: { id: hq.id },
        data: { isHeadquarters: true },
      });
      hq = { ...hq, isHeadquarters: true };
    }

    // 2. Plan HQ stock rows: only the products missing one
    const products = await tx.product.findMany({
      where: { organizationId: orgId },
      select: { id: true, quantity: true },
    });

    const existing = await tx.productStock.findMany({
      where: { branchId: hq.id, productId: { in: products.map((p) => p.id) } },
      select: { productId: true },
    });
    const existingIds = new Set(existing.map((e) => e.productId));

    const toCreate = planHqStockCreations(products, existingIds);
    if (toCreate.length > 0) {
      // skipDuplicates: belt-and-suspenders against races on the unique constraint
      await tx.productStock.createMany({
        data: toCreate.map((p) => ({
          productId: p.id,
          branchId: hq.id,
          quantity: p.quantity,
          organizationId: orgId,
        })),
        skipDuplicates: true,
      });
    }

    // 3. Verify Σ(ProductStock HQ) == Σ(Product.quantity)
    const hqStocks = await tx.productStock.findMany({
      where: { branchId: hq.id },
      select: { id: true, quantity: true },
    });
    const verified = verifyHqStockSum(products, hqStocks);

    return {
      organizationId: orgId,
      headquartersBranchId: hq.id,
      migrated: toCreate.length,
      skipped: products.length - toCreate.length,
      verified,
    };
  });
}

async function main() {
  console.log(
    "⚠️  Hacé backup antes: pg_dump \"$DATABASE_URL\" > backup.sql  o  GET /api/backups (ADMIN)",
  );
  console.log("Migrando stock global → casa central por organización...\n");

  const orgs = await basePrisma.organization.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  let totalMigrated = 0;
  let totalSkipped = 0;
  let allVerified = true;

  for (const org of orgs) {
    const result = await migrateOrganizationStock(org.id);
    totalMigrated += result.migrated;
    totalSkipped += result.skipped;
    if (!result.verified) allVerified = false;

    const status = result.verified ? "✅ Σ OK" : "❌ Σ MISMATCH";
    console.log(
      `[${org.name}] HQ=${result.headquartersBranchId} migrados=${result.migrated} ` +
        `ya existían=${result.skipped} ${status}`,
    );
  }

  console.log(
    `\nResumen: ${totalMigrated} productos migrados, ${totalSkipped} ya existían (skipped). ` +
      `Verificación Σ: ${allVerified ? "OK en todas las orgs" : "FALLO en alguna org — revisar"}.`,
  );
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

/**
 * Rollback del backfill de unitsPerBox (sdd/venta-por-unidad-multpack).
 *
 * Standalone ts-node — correr EN EL VPS (requiere PostgreSQL). Dry-run es el
 * DEFAULT; --apply escribe. Reversa exacta del backfill-unitsPerBox.ts:
 *   1. Divide cada `ProductStock.quantity` por `unitsPerBox` (vuelve a CAJAS).
 *   2. Divide `Product.quantity` (legacy, casa central) por `unitsPerBox`.
 *   3. Limpia `unitsPerBox` (seteado a null → vuelve a box-only).
 *
 * Solo procesa productos cuyo `unitsPerBox` es > 1 (multi-packs ya
 * backfilleados); los que ya son null se skipiean (idempotente).
 *
 * H U M A N   G A T E:
 *   1. `--dry-run` → revisar el impacto.
 *   2. `--apply` → correr solo tras confirmación manual.
 *
 * Usage:
 *   npx ts-node api/prisma/scripts/rollback-unitsPerBox.ts --org <slug>
 *   npx ts-node api/prisma/scripts/rollback-unitsPerBox.ts --org <slug> --apply
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { boxesForUnits } from "./unitsPerBoxMigration";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

async function main() {
  const args = process.argv.slice(2);
  const orgSlug = args.includes("--org") ? args[args.indexOf("--org") + 1] : null;
  const apply = args.includes("--apply");
  if (!orgSlug) {
    console.error("Usage: npx ts-node api/prisma/scripts/rollback-unitsPerBox.ts --org <slug> [--apply]");
    process.exit(1);
  }

  console.log(`🔁 Rollback unitsPerBox for org slug: ${orgSlug}`);
  console.log(`   Mode: ${apply ? "APPLY (writes)" : "DRY-RUN (preview only)"}`);
  console.log();

  const org = await db.organization.findFirst({ where: { slug: orgSlug } });
  if (!org) {
    console.error(`❌ Organization not found: ${orgSlug}`);
    process.exit(1);
  }
  const orgId = org.id;
  console.log(`   Organization: ${org.name} (${orgId})`);
  console.log();

  const products = await db.product.findMany({
    where: { organizationId: orgId, unitsPerBox: { gt: 1 } },
    select: { id: true, name: true, unitsPerBox: true, quantity: true },
    orderBy: { name: "asc" },
  });
  console.log(`   Multi-packs backfilleados (unitsPerBox > 1) a revertir: ${products.length}`);
  console.log();

  if (products.length === 0) {
    console.log("✅ No hay productos con unitsPerBox > 1 para revertir.");
    await db.$disconnect();
    return;
  }

  console.log("📋 IMPACTO (dry-run — de UNIDADES a CAJAS):");
  console.log("   Producto                                    | UnitsPerBox | Stock por sucursal");
  console.log("   ────────────────────────────────────────────┼─────────────┼─────────────");
  for (const p of products) {
    const stocks = await db.productStock.findMany({
      where: { productId: p.id, organizationId: orgId },
      select: { branchId: true, quantity: true },
    });
    const totalUnits = stocks.reduce((s, r) => s + r.quantity, 0);
    const totalBoxes = stocks.reduce((s, r) => s + boxesForUnits(r.quantity, p.unitsPerBox as number), 0);
    console.log(
      `   ${p.name.slice(0, 40).padEnd(40)} | ${String(p.unitsPerBox).padEnd(11)} | ${totalUnits} unidades → ${totalBoxes} cajas`,
    );
  }
  console.log();

  if (!apply) {
    console.log("🔒 DRY-RUN: no writes performed. Run with --apply to persist.");
    console.log(`   Would revert ${products.length} product(s).`);
    console.log();
    console.log(`   npx ts-node api/prisma/scripts/rollback-unitsPerBox.ts --org ${orgSlug} --apply`);
    await db.$disconnect();
    return;
  }

  console.log("✍️  APPLYING rollback...");
  const BATCH = 100;
  let updated = 0;
  for (let i = 0; i < products.length; i += BATCH) {
    const batch = products.slice(i, i + BATCH);
    await db.$transaction(async (tx) => {
      for (const p of batch) {
        const upb = p.unitsPerBox as number;
        // 1) Volver el stock de ProductStock a CAJAS (÷ unitsPerBox).
        await tx.productStock.updateMany({
          where: { productId: p.id, organizationId: orgId },
          data: { quantity: { divide: upb } },
        });
        // 2) Volver Product.quantity (legacy) a CAJAS.
        await tx.product.updateMany({
          where: { id: p.id, organizationId: orgId },
          data: { quantity: { divide: upb } },
        });
        // 3) Limpiar unitsPerBox (vuelve a box-only).
        await tx.product.updateMany({
          where: { id: p.id, organizationId: orgId },
          data: { unitsPerBox: null },
        });
        updated++;
        console.log(`   ✔ ${p.name} → unitsPerBox=null`);
      }
    });
    console.log(`   Revertidos: ${updated}/${products.length}`);
  }

  console.log();
  console.log("✅ Rollback complete.");
  await db.$disconnect();
}

main().catch((e) => {
  console.error("❌ Fatal error:", e);
  process.exit(1);
});

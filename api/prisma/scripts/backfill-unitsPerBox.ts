/**
 * Backfill de unitsPerBox para el multi-pack por unidad (sdd/venta-por-unidad-multpack).
 *
 * Standalone ts-node — correr EN EL VPS (requiere PostgreSQL). Dry-run es el
 * DEFAULT; --apply escribe. Idempotente: solo procesa productos cuyo
 * `unitsPerBox` es null; un re-run skipea los ya seteado.
 *
 * Qué hace, por producto elegible (unitsPerBox null y parse "NxG" > 1):
 *   1. Settea `products.unitsPerBox` = N (parse del nombre).
 *   2. Convierte el stock a UNIDADES: cada `ProductStock.quantity` × N.
 *   3. Recomputa `Product.quantity` (legacy, casa central) en unidades: × N.
 *
 * H U M A N   A P P L Y   G A T E  (task 3.3):
 *   1. `--dry-run` en el VPS → revisar la lista de candidatos y el count parseado.
 *   2. Confirmación humana del count (>1 y no multi-pack mal parseado).
 *   3. `--apply` → correr.
 *   4. Verificar stock/venta; si hay mal-parse → `rollback-unitsPerBox.ts`.
 *
 * Usage:
 *   npx ts-node api/prisma/scripts/backfill-unitsPerBox.ts --org <slug>
 *   npx ts-node api/prisma/scripts/backfill-unitsPerBox.ts --org <slug> --apply
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { deriveBackfillUnitsPerBox, shouldBackfill } from "./unitsPerBoxMigration";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

interface Candidate {
  id: string;
  name: string;
  unitsPerBox: number;
}

async function main() {
  const args = process.argv.slice(2);
  const orgSlug = args.includes("--org") ? args[args.indexOf("--org") + 1] : null;
  const apply = args.includes("--apply");
  if (!orgSlug) {
    console.error("Usage: npx ts-node api/prisma/scripts/backfill-unitsPerBox.ts --org <slug> [--apply]");
    process.exit(1);
  }

  console.log(`🔍 Backfill unitsPerBox for org slug: ${orgSlug}`);
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

  // Todos los productos de la org con stock propio (ProductStock es multi-branch).
  const products = await db.product.findMany({
    where: { organizationId: orgId },
    select: { id: true, name: true, unitsPerBox: true, quantity: true },
    orderBy: { name: "asc" },
  });
  console.log(`   Total products: ${products.length}`);

  // Solo productos sin unitsPerBox todavía (idempotencia).
  const pending = products.filter((p) => shouldBackfill(p.unitsPerBox));
  console.log(`   Sin unitsPerBox (candidatos a parsear): ${pending.length}`);

  // Deriva el unitsPerBox del nombre (solo multi-packs reales, > 1).
  const candidates: Candidate[] = [];
  for (const p of pending) {
    const derived = deriveBackfillUnitsPerBox(p.name, p.unitsPerBox);
    if (derived !== null) {
      candidates.push({ id: p.id, name: p.name, unitsPerBox: derived });
    }
  }
  console.log(`   Parseados como multi-pack (unitsPerBox > 1): ${candidates.length}`);
  console.log();

  if (candidates.length === 0) {
    console.log("✅ No hay productos multi-pack para backfillear.");
    await db.$disconnect();
    return;
  }

  // ── Dry-run: mostrar candidatos + el impacto en stock (unidades vs cajas) ──
  console.log("📋 CANDIDATOS (dry-run):");
  console.log("   Producto                                    | UnitsPerBox | Stock por sucursal");
  console.log("   ────────────────────────────────────────────┼─────────────┼─────────────");
  for (const c of candidates) {
    const stocks = await db.productStock.findMany({
      where: { productId: c.id, organizationId: orgId },
      select: { branchId: true, quantity: true },
    });
    const totalBoxes = stocks.reduce((s, r) => s + r.quantity, 0);
    const totalUnits = stocks.reduce((s, r) => s + r.quantity * c.unitsPerBox, 0);
    console.log(
      `   ${c.name.slice(0, 40).padEnd(40)} | ${String(c.unitsPerBox).padEnd(11)} | ${totalBoxes} cajas → ${totalUnits} unidades`,
    );
  }
  console.log();

  if (!apply) {
    console.log("🔒 DRY-RUN: no writes performed. Run with --apply to persist.");
    console.log(`   Would backfill ${candidates.length} product(s).`);
    console.log();
    console.log("   Run with --apply after human confirm:");
    console.log(`   npx ts-node api/prisma/scripts/backfill-unitsPerBox.ts --org ${orgSlug} --apply`);
    await db.$disconnect();
    return;
  }

  // ── Apply ──
  console.log("✍️  APPLYING backfill...");
  const BATCH = 100;
  let updated = 0;
  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);
    await db.$transaction(async (tx) => {
      for (const c of batch) {
        // 1) Setear unitsPerBox.
        await tx.product.updateMany({
          where: { id: c.id, organizationId: orgId },
          data: { unitsPerBox: c.unitsPerBox },
        });
        // 2) Convertir ProductStock a unidades (× unitsPerBox). ProductStock es
        //    tenant-scoped → filtro ORGANIZACIÓN explícito (el cliente extendido
        //    no está disponible acá).
        await tx.productStock.updateMany({
          where: { productId: c.id, organizationId: orgId },
          data: { quantity: { multiply: c.unitsPerBox } },
        });
        // 3) Recomputar Product.quantity (legacy, casa central) en unidades.
        await tx.product.updateMany({
          where: { id: c.id, organizationId: orgId },
          data: { quantity: { multiply: c.unitsPerBox } },
        });
        updated++;
        console.log(`   ✔ ${c.name} → unitsPerBox=${c.unitsPerBox}`);
      }
    });
    console.log(`   Procesados: ${updated}/${candidates.length}`);
  }

  console.log();
  console.log("✅ Backfill complete. Verificar stock en la UI / e2e en el VPS.");
  console.log("   Si hay un mal-parse, revertir con:");
  console.log(`   npx ts-node api/prisma/scripts/rollback-unitsPerBox.ts --org ${orgSlug} --apply`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error("❌ Fatal error:", e);
  process.exit(1);
});

// Script: poner stock inicial a los productos cargados desde las listas de
// ropa para mascotas (scripts/data/ropa-listas.ts). Por defecto 50 unidades.
//
// Convención del repo: Product.quantity == ProductStock de la casa central.
// Por eso escribe AMBOS: la fila ProductStock de la casa central (crea o
// actualiza) y Product.quantity. Solo toca productos del dataset que hoy no
// tienen stock (quantity 0 y ninguna fila != 0): nunca pisa un conteo real.
//
// Usage (en el VPS):
//   TS_NODE_PROJECT=/var/www/pullstok/api/tsconfig.json \
//     npx ts-node --transpile-only scripts/set-ropa-mascotas-stock.ts [--qty=50] [orgId]
//   ... --apply [--qty=50] [orgId]
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { CATALOG, planStock } from "./data/ropa-listas";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DEFAULT_ORG = "1bc3a6c5-1d06-4e40-93ba-12d51a2a2a1b";

const args = process.argv.slice(2);
const mode = args.includes("--apply") ? "apply" : "dry-run";
const qtyArg = args.find((a) => a.startsWith("--qty="));
const QTY = qtyArg ? Number(qtyArg.slice("--qty=".length)) : 50;
const TARGET_ORG = args.find((a) => !a.startsWith("--")) || DEFAULT_ORG;

async function main() {
  if (!Number.isInteger(QTY) || QTY <= 0) {
    console.error(`Invalid --qty: ${qtyArg}`);
    process.exit(1);
  }
  console.log(`Mode: ${mode}  qty=${QTY}`);
  console.log(`Target org: ${TARGET_ORG}`);

  const branches = await prisma.branch.findMany({
    where: { organizationId: TARGET_ORG },
    select: { id: true, name: true, isHeadquarters: true, isActive: true },
  });
  console.log("Branches:");
  for (const b of branches) {
    console.log(`  ${b.isHeadquarters ? "[HQ] " : "     "}${b.name} (${b.id.slice(0, 8)}) active=${b.isActive}`);
  }
  const hq = branches.find((b) => b.isHeadquarters);
  if (!hq) {
    console.error("No headquarters branch found, aborting.");
    process.exit(1);
  }

  const products = await prisma.product.findMany({
    where: { organizationId: TARGET_ORG },
    select: { id: true, name: true, quantity: true, stocks: { select: { branchId: true, quantity: true } } },
  });
  const plan = planStock(
    products.map((p) => ({ id: p.id, name: p.name, quantity: p.quantity, rows: p.stocks })),
    new Set(CATALOG.map((i) => i.name)),
    hq.id,
  );

  console.log(`\nDataset: ${CATALOG.length} | a poner stock: ${plan.toSet.length} | omitidos: ${plan.skipped.length}`);
  for (const s of plan.skipped) console.log(`  OMITIDO (${s.reason}): ${s.name}`);
  if (plan.toSet.length < CATALOG.length - plan.skipped.length) {
    console.log("  (hay productos del dataset que no existen todavía en la org)");
  }

  if (mode === "dry-run") {
    console.log("\nDRY-RUN only. No rows written. Re-run with --apply to write.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const p of plan.toSet) {
      await tx.productStock.upsert({
        where: { productId_branchId: { productId: p.id, branchId: hq.id } },
        update: { quantity: QTY },
        create: { productId: p.id, branchId: hq.id, quantity: QTY, organizationId: TARGET_ORG },
      });
      await tx.product.update({ where: { id: p.id }, data: { quantity: QTY } });
    }
  });
  console.log(`\nAPPLIED: stock ${QTY} set on ${plan.toSet.length} products (branch ${hq.name}).`);
}

main()
  .catch((e) => {
    console.error("ERROR:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

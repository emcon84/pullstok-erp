// Script: dejar operativos los productos cargados desde la lista de huesos a
// granel (scripts/data/huesos-granel.ts): stock inicial en la casa central (por
// defecto 50 unidades) y marcarlos como "carried" (lo que el negocio trabaja).
// Mismo criterio que set-accesorios-stock.ts + mark-accesorios-carried.ts.
//
// Convención del repo: Product.quantity == ProductStock de la casa central, por
// eso el stock escribe AMBOS. Solo toca productos del dataset que hoy no tienen
// stock (nunca pisa un conteo real) y solo pasa carried false -> true. No toca
// ningún otro producto ni ningún otro campo.
//
// Usage (en el VPS):
//   TS_NODE_PROJECT=/var/www/pullstok/api/tsconfig.json \
//     npx ts-node --transpile-only scripts/finish-huesos-granel.ts [--qty=50] [orgId]
//   ... --apply [--qty=50] [orgId]
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { HUESOS_NAMES } from "./data/huesos-granel";
import { planStock } from "./data/accesorios-listas";

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

  const hq = await prisma.branch.findFirst({
    where: { organizationId: TARGET_ORG, isHeadquarters: true },
    select: { id: true, name: true },
  });
  if (!hq) {
    console.error("No headquarters branch found, aborting.");
    process.exit(1);
  }
  console.log(`Casa central: ${hq.name} (${hq.id.slice(0, 8)})`);

  const products = await prisma.product.findMany({
    where: { organizationId: TARGET_ORG, name: { in: [...HUESOS_NAMES] } },
    select: {
      id: true,
      name: true,
      quantity: true,
      carried: true,
      stocks: { select: { branchId: true, quantity: true } },
    },
  });
  const plan = planStock(
    products.map((p) => ({ id: p.id, name: p.name, quantity: p.quantity, rows: p.stocks })),
    new Set(HUESOS_NAMES),
    hq.id,
  );
  const toMark = products.filter((p) => !p.carried);

  console.log(
    `\nDataset: ${HUESOS_NAMES.length} | en la org: ${products.length} | a poner stock: ${plan.toSet.length} | omitidos: ${plan.skipped.length} | a marcar carried: ${toMark.length}`,
  );
  for (const s of plan.skipped) console.log(`  OMITIDO stock (${s.reason}): ${s.name}`);

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
    await tx.product.updateMany({
      where: { organizationId: TARGET_ORG, name: { in: [...HUESOS_NAMES] }, carried: false },
      data: { carried: true },
    });
  });
  console.log(
    `\nAPPLIED: stock ${QTY} en ${plan.toSet.length} productos (${hq.name}); ${toMark.length} marcados carried.`,
  );
}

main()
  .catch((e) => {
    console.error("ERROR:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

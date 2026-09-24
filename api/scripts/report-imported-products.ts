// Read-only: shows which signals identify "imported" products for one org
// (provider assigned, price-list rows, "import" categories) and how they
// overlap. Writes NOTHING.
// Usage (on the VPS, from /var/www/pullstok/api):
//   npx ts-node --transpile-only scripts/report-imported-products.ts <orgId>
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const orgId = process.argv[2];

async function main() {
  if (!orgId) throw new Error("Falta el orgId");

  const products = await prisma.product.findMany({
    where: { organizationId: orgId },
    select: {
      id: true,
      name: true,
      providerId: true,
      provider: { select: { name: true } },
      category: { select: { name: true } },
      _count: { select: { priceListEntries: true, saleItems: true, orderItems: true, quotationItems: true } },
    },
  });
  console.log(`Productos de la org: ${products.length}\n`);

  const byProvider = new Map<string, number>();
  for (const p of products) {
    const key = p.provider?.name ?? "(sin proveedor)";
    byProvider.set(key, (byProvider.get(key) ?? 0) + 1);
  }
  console.log("Por proveedor:");
  for (const [k, n] of [...byProvider].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}  ${k}`);
  }

  const withProvider = products.filter((p) => p.providerId);
  const withPriceList = products.filter((p) => p._count.priceListEntries > 0);
  const importCats = await prisma.category.findMany({
    where: { organizationId: orgId, name: { contains: "IMPORT", mode: "insensitive" } },
    select: { id: true, name: true },
  });
  console.log(`\ncon proveedor asignado: ${withProvider.length}`);
  console.log(`con filas de planilla de precios (PriceListEntry): ${withPriceList.length}`);
  console.log(`categorías con "IMPORT" en el nombre: ${importCats.length}`);
  for (const c of importCats) {
    const n = products.filter((p) => p.category && p.category.name === c.name).length;
    console.log(`  - ${c.name}: ${n} productos`);
  }

  const withHistory = withProvider.filter(
    (p) => p._count.saleItems > 0 || p._count.orderItems > 0 || p._count.quotationItems > 0,
  );
  const blocked = withProvider.filter((p) => p._count.orderItems > 0 || p._count.quotationItems > 0);
  console.log(`\nDe los que tienen proveedor: con ventas/pedidos/presupuestos=${withHistory.length}, bloqueados (pedidos/presupuestos)=${blocked.length}`);

  console.log("\nEjemplos con proveedor (hasta 8):");
  for (const p of withProvider.slice(0, 8)) {
    console.log(`  ${p.name}  [${p.provider?.name}] cat=${p.category?.name ?? "—"}`);
  }
  console.log("\nREAD-ONLY: no se escribió nada.");
}

main()
  .catch((e) => {
    console.error("ERROR:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

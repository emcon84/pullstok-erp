// Read-only: reports the products under a category tree (the category matched
// by name plus all its descendants) and how much history hangs off them, so a
// deletion can be planned. Writes NOTHING.
// Usage (on the VPS, from /var/www/pullstok/api):
//   npx ts-node --transpile-only scripts/report-category-products.ts [CATEGORY_NAME] [orgId]
// CATEGORY_NAME defaults to ACCESORIOS (case-insensitive "contains", any level).
// ReviewQueueEntry is deliberately not counted: that table can be missing on prod.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const categoryName = (process.argv[2] ?? "ACCESORIOS").trim();
const orgArg = process.argv[3];

async function main() {
  const categories = await prisma.category.findMany({
    where: orgArg ? { organizationId: orgArg } : undefined,
    select: { id: true, name: true, parentId: true, organizationId: true },
  });
  const byParent = new Map<string | null, typeof categories>();
  for (const c of categories) {
    const list = byParent.get(c.parentId) ?? [];
    list.push(c);
    byParent.set(c.parentId, list);
  }

  const orgs = await prisma.organization.findMany({ select: { id: true, name: true } });
  const orgName = (id: string) => orgs.find((o) => o.id === id)?.name ?? "?";

  const roots = categories.filter((c) =>
    c.name.trim().toUpperCase().includes(categoryName.toUpperCase()),
  );
  console.log(`Categorías cuyo nombre contiene "${categoryName}": ${roots.length}`);
  for (const r of roots) {
    const parent = categories.find((c) => c.id === r.parentId);
    console.log(
      `  - ${r.name} (id=${r.id}) org="${orgName(r.organizationId)}" (${r.organizationId}) padre=${parent?.name ?? "—"}`,
    );
  }
  if (roots.length === 0) return;

  // Depth-first walk of each matched root, keeping the path for display. A
  // matched category nested under another matched one is visited only once.
  const tree: { id: string; path: string }[] = [];
  const seen = new Set<string>();
  const walk = (id: string, path: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    tree.push({ id, path });
    for (const child of byParent.get(id) ?? []) walk(child.id, `${path} > ${child.name}`);
  };
  for (const r of roots) walk(r.id, r.name);

  const products = await prisma.product.findMany({
    where: { categoryId: { in: tree.map((t) => t.id) } },
    select: {
      id: true,
      name: true,
      categoryId: true,
      quantity: true,
      _count: {
        select: {
          saleItems: true,
          orderItems: true,
          quotationItems: true,
          priceListEntries: true,
          stocks: true,
          variantAssignments: true,
        },
      },
    },
  });

  console.log(`\nCategorías en el árbol: ${tree.length} | Productos totales: ${products.length}\n`);
  console.log("Productos por categoría:");
  for (const t of tree) {
    const n = products.filter((p) => p.categoryId === t.id).length;
    console.log(`  ${String(n).padStart(5)}  ${t.path}`);
  }

  const withSales = products.filter((p) => p._count.saleItems > 0);
  const withOrders = products.filter((p) => p._count.orderItems > 0);
  const withQuotes = products.filter((p) => p._count.quotationItems > 0);
  const withPriceList = products.filter((p) => p._count.priceListEntries > 0);
  const withStock = products.filter((p) => p.quantity > 0);
  const blocked = products.filter((p) => p._count.orderItems > 0 || p._count.quotationItems > 0);

  console.log("\nHistorial que cuelga de estos productos:");
  console.log(`  con ventas (SaleItem, quedarían con productId=null): ${withSales.length}`);
  console.log(`  con pedidos (OrderItem, FK obligatoria: BLOQUEAN el borrado): ${withOrders.length}`);
  console.log(`  con presupuestos (QuotationItem, FK obligatoria: BLOQUEAN el borrado): ${withQuotes.length}`);
  console.log(`  con filas de planilla de precios (PriceListEntry, productId=null): ${withPriceList.length}`);
  console.log(`  con stock > 0 (Product.quantity): ${withStock.length}`);
  console.log(`  => bloqueados por pedidos/presupuestos: ${blocked.length}`);

  const sample = (label: string, list: typeof products) => {
    if (list.length === 0) return;
    console.log(`\nEjemplos ${label} (hasta 10):`);
    for (const p of list.slice(0, 10)) {
      console.log(
        `  ${p.name}  [ventas=${p._count.saleItems} pedidos=${p._count.orderItems} presup=${p._count.quotationItems}]`,
      );
    }
  };
  sample("bloqueados", blocked);
  sample("con ventas", withSales);

  console.log("\nREAD-ONLY: no se escribió nada.");
}

main()
  .catch((e) => {
    console.error("ERROR:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

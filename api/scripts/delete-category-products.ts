// Deletes the PRODUCTS under one or more category trees (the categories
// themselves are NEVER touched). Dry-run by default; nothing is written
// without --apply. Guards: scoped to one org, optional product exclusions by
// exact name, refuses to run if any product has orders/quotations (their FKs
// are mandatory), and aborts if the count differs from --expect.
// Cascades at DB level: product_stocks and product_variants go with the
// product; sale_items / price_list_entries keep their row with productId=null.
//
// Usage (on the VPS, from /var/www/pullstok/api):
//   npx ts-node --transpile-only scripts/delete-category-products.ts \
//     --org <orgId> --root <categoryId> [--root <categoryId> ...] \
//     [--exclude-name "EXACT PRODUCT NAME" ...] [--expect N] [--apply]
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function parseArgs(argv: string[]) {
  const out = { org: "", roots: [] as string[], excludes: [] as string[], expect: null as number | null, apply: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--org") out.org = argv[++i] ?? "";
    else if (a === "--root") out.roots.push(argv[++i] ?? "");
    else if (a === "--exclude-name") out.excludes.push(argv[++i] ?? "");
    else if (a === "--expect") out.expect = Number(argv[++i]);
    else if (a === "--apply") out.apply = true;
    else throw new Error(`Argumento desconocido: ${a}`);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.org || args.roots.length === 0) throw new Error("Faltan --org y al menos un --root");
  if (args.expect !== null && !Number.isInteger(args.expect)) throw new Error("--expect debe ser un entero");

  const categories = await prisma.category.findMany({
    where: { organizationId: args.org },
    select: { id: true, name: true, parentId: true },
  });
  const byParent = new Map<string | null, typeof categories>();
  for (const c of categories) {
    const list = byParent.get(c.parentId) ?? [];
    list.push(c);
    byParent.set(c.parentId, list);
  }

  const treeIds = new Set<string>();
  const walk = (id: string) => {
    if (treeIds.has(id)) return;
    treeIds.add(id);
    for (const child of byParent.get(id) ?? []) walk(child.id);
  };
  for (const root of args.roots) {
    const cat = categories.find((c) => c.id === root);
    if (!cat) throw new Error(`La categoría ${root} no existe en la org ${args.org}`);
    console.log(`Raíz: ${cat.name} (${cat.id})`);
    walk(root);
  }
  console.log(`Categorías en el alcance: ${treeIds.size} (NO se tocan)`);

  const inScope = await prisma.product.findMany({
    where: { organizationId: args.org, categoryId: { in: [...treeIds] } },
    select: {
      id: true,
      name: true,
      _count: { select: { saleItems: true, orderItems: true, quotationItems: true } },
    },
  });

  const excludedNames = args.excludes.map((n) => n.trim().toUpperCase());
  for (const n of excludedNames) {
    if (!inScope.some((p) => p.name.trim().toUpperCase() === n)) {
      throw new Error(`--exclude-name "${n}" no coincide con ningún producto del alcance`);
    }
  }
  const excluded = inScope.filter((p) => excludedNames.includes(p.name.trim().toUpperCase()));
  const targets = inScope.filter((p) => !excludedNames.includes(p.name.trim().toUpperCase()));

  console.log(`\nProductos en el alcance: ${inScope.length}`);
  console.log(`Excluidos (se conservan): ${excluded.length}`);
  for (const p of excluded) console.log(`  = ${p.name}`);
  console.log(`A BORRAR: ${targets.length}`);

  const blocked = targets.filter((p) => p._count.orderItems > 0 || p._count.quotationItems > 0);
  if (blocked.length > 0) {
    for (const p of blocked) console.log(`  BLOQUEADO: ${p.name} (pedidos=${p._count.orderItems} presup=${p._count.quotationItems})`);
    throw new Error(`${blocked.length} producto(s) con pedidos/presupuestos: abortando`);
  }
  const withSales = targets.filter((p) => p._count.saleItems > 0);
  console.log(`Con ventas (quedarían con productId=null): ${withSales.length}`);
  for (const p of withSales) console.log(`  ~ ${p.name} (ventas=${p._count.saleItems})`);

  if (args.expect !== null && targets.length !== args.expect) {
    throw new Error(`Se esperaban ${args.expect} productos y hay ${targets.length}: abortando`);
  }
  if (targets.length === 0) {
    console.log("Nada para borrar.");
    return;
  }

  if (!args.apply) {
    console.log("\nDRY-RUN: no se escribió nada. Re-ejecutar con --apply para borrar.");
    return;
  }

  const ids = targets.map((p) => p.id);
  const result = await prisma.product.deleteMany({ where: { id: { in: ids }, organizationId: args.org } });
  console.log(`\nBORRADOS: ${result.count}`);
  const remaining = await prisma.product.count({
    where: { organizationId: args.org, categoryId: { in: [...treeIds] } },
  });
  console.log(`Quedan en el alcance: ${remaining} (esperado: ${excluded.length})`);
  if (result.count !== targets.length || remaining !== excluded.length) {
    throw new Error("El resultado no coincide con lo esperado: revisar");
  }
}

main()
  .catch((e) => {
    console.error("ERROR:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

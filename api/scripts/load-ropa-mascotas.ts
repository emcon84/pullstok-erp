// Script: cargar la ropa para mascotas de las listas fotografiadas (sin marca,
// LECHE Y MIEL, ROPA JAMIRO, LAS CHIQUIS, BUEN ABRIGO). Los datos viven en
// scripts/data/ropa-listas.ts (transcripción a mano de las 3 fotos en
// Downloads/ropa).
//
// Este script NUNCA borra ni actualiza nada. Para cada fila del dataset:
//  - resuelve la categoría por "PADRE > HOJA" contra el árbol existente de la org;
//  - si ya existe un producto con ese nombre (case-insensitive) lo omite;
//  - si no, en --apply lo crea (quantity=0, sin stock, no publicado en la tienda).
// Las filas dudosas (PENDING) no se cargan; se listan al final.
//
// Usage (en el VPS):
//   TS_NODE_PROJECT=/var/www/pullstok/api/tsconfig.json \
//     npx ts-node --transpile-only scripts/load-ropa-mascotas.ts [orgId]
//   ... --apply [--carried] [orgId]
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  CATALOG,
  PENDING,
  VERIFY,
  planLoad,
  validateCatalog,
} from "./data/ropa-listas";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DEFAULT_ORG = "1bc3a6c5-1d06-4e40-93ba-12d51a2a2a1b";

const args = process.argv.slice(2);
const mode = args.includes("--apply") ? "apply" : "dry-run";
const carried = args.includes("--carried");
const TARGET_ORG = args.find((a) => !a.startsWith("--")) || DEFAULT_ORG;

async function main() {
  console.log(`Mode: ${mode}  carried=${carried}`);
  console.log(`Target org: ${TARGET_ORG}`);

  const problems = validateCatalog(CATALOG);
  if (problems.length > 0) {
    console.error("Dataset invalid, aborting:\n" + problems.join("\n"));
    process.exit(1);
  }

  const org = await prisma.organization.findUnique({
    where: { id: TARGET_ORG },
    select: { name: true },
  });
  if (!org) {
    console.error("Org not found");
    process.exit(1);
  }
  console.log(`Org: ${org.name}\n`);

  const categories = await prisma.category.findMany({
    where: { organizationId: TARGET_ORG },
    select: { id: true, name: true, parentId: true },
  });
  const nameById = new Map(categories.map((c) => [c.id, c.name]));
  const categoryIds = new Map<string, string>();
  for (const c of categories) {
    if (!c.parentId) continue;
    const parentName = nameById.get(c.parentId);
    if (parentName) categoryIds.set(`${parentName} > ${c.name}`, c.id);
  }

  const existing = await prisma.product.findMany({
    where: { organizationId: TARGET_ORG },
    select: { name: true },
  });
  const plan = planLoad(CATALOG, categoryIds, new Set(existing.map((p) => p.name)));

  const perCategory = new Map<string, number>();
  for (const p of plan.toCreate) {
    perCategory.set(p.category, (perCategory.get(p.category) ?? 0) + 1);
  }
  console.log("=== A CREAR POR CATEGORÍA ===");
  for (const [cat, n] of [...perCategory].sort()) console.log(`  ${String(n).padStart(3)}  ${cat}`);

  console.log(`\nDataset: ${CATALOG.length} | a crear: ${plan.toCreate.length} | ya existen (se omiten): ${plan.existing.length}`);
  if (plan.existing.length > 0) {
    for (const e of plan.existing) console.log(`  YA EXISTE: ${e.name}`);
  }
  if (plan.missingCategories.length > 0) {
    console.log("\n!! CATEGORÍAS NO ENCONTRADAS (sus filas NO se cargan):");
    for (const c of plan.missingCategories) console.log(`  ${c}`);
  }

  console.log("\n=== NO CARGADOS (a decidir con el dueño) ===");
  for (const p of PENDING) console.log(`  [${p.source}] ${p.text} -> ${p.reason}`);
  console.log("\n=== CARGADOS COMO ESTÁN IMPRESOS, VERIFICAR ===");
  for (const v of VERIFY) console.log(`  ${v.name}: ${v.note}`);

  if (mode === "dry-run") {
    console.log("\nDRY-RUN only. No rows written. Re-run with --apply to write.");
    return;
  }

  const result = await prisma.product.createMany({
    data: plan.toCreate.map((p) => ({
      name: p.name,
      price: p.price,
      quantity: 0,
      categoryId: p.categoryId,
      organizationId: TARGET_ORG,
      publishedToStore: false,
      carried,
    })),
  });
  console.log(`\nAPPLIED: ${result.count} products created.`);
}

main()
  .catch((e) => {
    console.error("ERROR:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

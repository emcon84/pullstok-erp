// Script: cargar la "Lista de precios de huesos a granel" (planilla lista sep
// 2026.xlsx) en PERROS > SNACKS, PREMIOS Y GOLOSINAS. Los datos viven en
// scripts/data/huesos-granel.ts (extraídos de la planilla).
//
// Este script NUNCA borra ni actualiza nada. Dry-run por defecto:
//  - resuelve la categoría por nombre (padre + hoja) en la org; si falta, aborta;
//  - omite nombres que ya existan en la org (case-insensitive) y duplicados
//    dentro de la planilla;
//  - omite filas sin nombre o sin precio (se listan);
//  - con --apply crea el resto en un solo createMany (quantity=0, sin stock,
//    no publicado en la tienda, carried=false).
//
// Usage (en el VPS):
//   TS_NODE_PROJECT=/var/www/pullstok/api/tsconfig.json \
//     npx ts-node --transpile-only scripts/load-huesos-granel.ts [--apply] [orgId]
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  DEFAULT_ORG,
  HUESOS_ROWS,
  TARGET_CATEGORY,
  planLoad,
} from "./data/huesos-granel";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const args = process.argv.slice(2);
const mode = args.includes("--apply") ? "apply" : "dry-run";
const TARGET_ORG = args.find((a) => !a.startsWith("--")) || DEFAULT_ORG;

async function main() {
  console.log(`Mode: ${mode}`);
  console.log(`Target org: ${TARGET_ORG}`);

  const org = await prisma.organization.findUnique({
    where: { id: TARGET_ORG },
    select: { name: true },
  });
  if (!org) {
    console.error("Org not found");
    process.exit(1);
  }
  console.log(`Org: ${org.name}`);

  const categories = await prisma.category.findMany({
    where: { organizationId: TARGET_ORG },
    select: { id: true, name: true, parentId: true },
  });
  const nameById = new Map(categories.map((c) => [c.id, c.name]));
  const category = categories.find(
    (c) =>
      c.name === TARGET_CATEGORY.leaf &&
      c.parentId !== null &&
      nameById.get(c.parentId) === TARGET_CATEGORY.parent,
  );
  if (!category) {
    console.error(
      `ERROR: categoría no encontrada: ${TARGET_CATEGORY.parent} > ${TARGET_CATEGORY.leaf}. No se escribe nada.`,
    );
    process.exit(1);
  }
  console.log(`Categoría: ${TARGET_CATEGORY.parent} > ${TARGET_CATEGORY.leaf} (${category.id})\n`);

  const existingProducts = await prisma.product.findMany({
    where: { organizationId: TARGET_ORG },
    select: { name: true },
  });
  const plan = planLoad(HUESOS_ROWS, new Set(existingProducts.map((p) => p.name)));

  console.log(
    `Dataset: ${HUESOS_ROWS.length} | a crear: ${plan.toCreate.length} | ya existen: ${plan.existing.length} | omitidos: ${plan.skipped.length}`,
  );

  console.log("\n=== A CREAR ===");
  for (const p of plan.toCreate) console.log(`  ${p.name}  $${p.price}`);

  console.log("\n=== YA EXISTEN (se omiten) ===");
  for (const e of plan.existing) console.log(`  [fila ${e.row}] ${e.name}`);

  console.log("\n=== OMITIDOS ===");
  for (const s of plan.skipped) console.log(`  [fila ${s.row}] "${s.text}" -> ${s.reason}`);

  if (mode === "dry-run") {
    console.log("\nDRY-RUN only. No rows written. Re-run with --apply to write.");
    return;
  }

  const result = await prisma.product.createMany({
    data: plan.toCreate.map((p) => ({
      name: p.name,
      price: p.price,
      quantity: 0,
      categoryId: category.id,
      organizationId: TARGET_ORG,
      publishedToStore: false,
      carried: false,
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

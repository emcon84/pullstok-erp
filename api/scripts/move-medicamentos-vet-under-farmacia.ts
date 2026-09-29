// Script: mueve la categoría "MEDICAMENTOS VET (...)" para que sea
// subcategoría de "FARMACIA" (hoy están al mismo nivel, ambas raíces).
// Decisión del usuario 2026-09-29: la simple, sin reclasificar los 1550
// productos de Farmacia en subcategorías — Medicamentos Vet solo cambia de
// padre (hoy tiene 0 productos, no hay nada más que mover).
//
// Usage (en el VPS):
//   TS_NODE_PROJECT=/var/www/pullstok/api/tsconfig.json \
//     npx ts-node --transpile-only scripts/move-medicamentos-vet-under-farmacia.ts [orgId]
//   ... --apply [orgId]
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DEFAULT_ORG = "1bc3a6c5-1d06-4e40-93ba-12d51a2a2a1b";
const FARMACIA_NAME = "FARMACIA";
const MEDICAMENTOS_NAME = "MEDICAMENTOS VET (ANTIBIÓTICOS, ANTIINFLAMATORIOS, GOTAS, ETC.)";

const args = process.argv.slice(2);
const mode = args.includes("--apply") ? "apply" : "dry-run";
const TARGET_ORG = args.find((a) => !a.startsWith("--")) || DEFAULT_ORG;

async function main() {
  console.log(`Mode: ${mode}`);
  console.log(`Target org: ${TARGET_ORG}`);

  const [farmacia, medicamentos] = await Promise.all([
    prisma.category.findFirst({
      where: { organizationId: TARGET_ORG, name: FARMACIA_NAME, parentId: null },
    }),
    prisma.category.findFirst({
      where: { organizationId: TARGET_ORG, name: MEDICAMENTOS_NAME },
    }),
  ]);

  if (!farmacia) {
    console.error(`No se encontró la categoría raíz "${FARMACIA_NAME}"`);
    process.exit(1);
  }
  if (!medicamentos) {
    console.error(`No se encontró la categoría "${MEDICAMENTOS_NAME}"`);
    process.exit(1);
  }

  console.log(`Farmacia: id=${farmacia.id}`);
  console.log(`Medicamentos Vet: id=${medicamentos.id} parentId actual=${medicamentos.parentId ?? "(ninguno, es raíz)"}`);

  if (medicamentos.parentId === farmacia.id) {
    console.log("\nYa está movida (parentId ya es Farmacia). Nada que hacer.");
    return;
  }

  // Colisión de nombre bajo el nuevo padre (constraint organizationId+parentId+name).
  const collision = await prisma.category.findFirst({
    where: { organizationId: TARGET_ORG, parentId: farmacia.id, name: MEDICAMENTOS_NAME },
  });
  if (collision) {
    console.error("Ya existe una categoría con ese nombre dentro de Farmacia. Abortando.");
    process.exit(1);
  }

  const productCount = await prisma.product.count({ where: { categoryId: medicamentos.id } });
  console.log(`Productos afectados (siguen en la misma categoría, solo cambia el padre): ${productCount}`);

  if (mode === "dry-run") {
    console.log("\nDRY-RUN only. No rows written. Re-run with --apply to write.");
    return;
  }

  await prisma.category.update({
    where: { id: medicamentos.id },
    data: { parentId: farmacia.id },
  });
  console.log(`\nAPPLIED: "${MEDICAMENTOS_NAME}" ahora es subcategoría de "${FARMACIA_NAME}".`);
}

main()
  .catch((e) => {
    console.error("ERROR:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

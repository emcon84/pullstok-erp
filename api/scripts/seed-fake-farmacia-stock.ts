/**
 * Seed de STOCK FICTICIO para la categoría FARMACIA (productos de farmacia /
 * veterinaria cargados de La Red Comercial y Laboratorios Elmer). Sirve para
 * que aparezcan como disponibles en el POS del vendedor sin cargar stock real.
 *
 * Reglas (idempotente, mismas que seed-fake-loose-stock):
 *   - Crea/actualiza ProductStock (unidades) por (producto, sucursal) SOLO
 *     donde la fila no existe o tiene quantity <= 0. NUNCA pisa stock real > 0.
 *   - Aplica a la categoría `FARMACIA` (+ sus descendientes si hubiera).
 *   - Env (opcional): FAKE_QTY = unidades ficticias [default 50],
 *     FAKE_ORG_SLUG = slug de la org [default el-almacen-de-las-mascotas].
 *
 * Uso (cwd = api/, con DB reachable):
 *   DRY RUN:  npx ts-node scripts/seed-fake-farmacia-stock.ts --dry-run
 *   FULL:     npx ts-node scripts/seed-fake-farmacia-stock.ts
 */
import "dotenv/config";
import { basePrisma } from "../src/config/db";

const ORG_SLUG = process.env.FAKE_ORG_SLUG || "el-almacen-de-las-mascotas";
const FAKE_QTY = (() => {
  const v = Number(process.env.FAKE_QTY);
  return Number.isFinite(v) && v > 0 ? v : 50;
})();

export const resolveFakeQty = (env: NodeJS.ProcessEnv = process.env): number => {
  const v = Number(env.FAKE_QTY);
  return Number.isFinite(v) && v > 0 ? v : 50;
};

export interface PlannedStockRow {
  kind: "create" | "update";
  existingId: string | null;
  productId: string;
  branchId: string;
  quantity: number;
}

export interface ExistingStockLike {
  id: string;
  productId: string;
  branchId: string;
  quantity: number;
}

/** Planifica filas ProductStock (producto × sucursal) a crear/actualizar:
 *  faltante → create; existente con quantity <= 0 → update; > 0 → se ignora
 *  (nunca se pisa stock real). Función pura. */
export const planFakeStock = (
  productIds: string[],
  branches: { id: string }[],
  existing: ExistingStockLike[],
  qty: number,
): PlannedStockRow[] => {
  const byKey = new Map(existing.map((e) => [`${e.productId}|${e.branchId}`, e]));
  const rows: PlannedStockRow[] = [];
  for (const productId of productIds) {
    for (const branch of branches) {
      const key = `${productId}|${branch.id}`;
      const row = byKey.get(key);
      if (row && row.quantity > 0) continue;
      rows.push({
        kind: row ? "update" : "create",
        existingId: row?.id ?? null,
        productId,
        branchId: branch.id,
        quantity: qty,
      });
    }
  }
  return rows;
};

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`Seed stock ficticio FARMACIA (FAKE_QTY=${FAKE_QTY}) | org: ${ORG_SLUG}`);

  const org = await basePrisma.organization.findFirst({ where: { slug: ORG_SLUG } });
  if (!org) {
    console.error(`Organization "${ORG_SLUG}" no encontrada. Usá FAKE_ORG_SLUG.`);
    process.exit(1);
  }

  const allCats = await basePrisma.category.findMany({
    where: { organizationId: org.id },
    select: { id: true, name: true, parentId: true },
  });
  const farmRoot = allCats.find((c) => c.name === "FARMACIA" && c.parentId === null);
  if (!farmRoot) {
    console.error('Categoría "FARMACIA" no encontrada.');
    process.exit(1);
  }

  // Recolectar FARMACIA + descendientes (si algún día se subcategoriza).
  const catIds = [farmRoot.id];
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of allCats) {
      if (c.parentId && catIds.includes(c.parentId) && !catIds.includes(c.id)) {
        catIds.push(c.id);
        changed = true;
      }
    }
  }

  const [products, branches] = await Promise.all([
    basePrisma.product.findMany({
      where: { organizationId: org.id, categoryId: { in: catIds } },
      select: { id: true },
    }),
    basePrisma.branch.findMany({
      where: { organizationId: org.id },
      select: { id: true },
    }),
  ]);

  const productIds = products.map((p) => p.id);
  const existingRows = await basePrisma.productStock.findMany({
    where: { organizationId: org.id, productId: { in: productIds } },
    select: { id: true, productId: true, branchId: true, quantity: true },
  });

  const plan = planFakeStock(productIds, branches, existingRows, FAKE_QTY);
  const creates = plan.filter((r) => r.kind === "create");
  const updates = plan.filter((r) => r.kind === "update");

  console.log(
    `Org: ${org.name} | productos en FARMACIA: ${productIds.length} | branches: ${branches.length} | ` +
      `Plan ProductStock: ${plan.length} (${creates.length} create, ${updates.length} update)`,
  );

  if (dryRun) {
    console.log("Dry run completa. No se escribió nada en la DB.");
    return;
  }

  await basePrisma.$transaction(async (tx) => {
    if (creates.length > 0) {
      await tx.productStock.createMany({
        data: creates.map((r) => ({
          productId: r.productId,
          branchId: r.branchId,
          quantity: r.quantity,
          organizationId: org.id,
        })),
        skipDuplicates: true,
      });
    }
    for (const u of updates) {
      await tx.productStock.updateMany({
        where: { id: u.existingId!, organizationId: org.id },
        data: { quantity: u.quantity },
      });
    }
  });

  console.log(`\nOK: ${creates.length} creados, ${updates.length} actualizados.`);
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error("FATAL:", err);
      process.exit(1);
    })
    .finally(async () => {
      await basePrisma.$disconnect();
    });
}

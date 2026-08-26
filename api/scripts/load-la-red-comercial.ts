/**
 * Load products from "La Red Comercial" (distribuidor) price list into an org.
 *
 * Origen: `scripts/data/la-red-comercial.json` (generado desde el .xlsx del
 * proveedor con `node` + `xlsx`). Columnas de la planilla:
 *   - "PROVEEDOR"  → en realidad es el LABORATORIO / marca (AFFORD, ATON, ...).
 *   - "ARTÍCULO"   → nombre del producto.
 *   - "PRECIO (SIN IVA)" → precio del distribuidor sin IVA.
 *
 * Decisiones (confirmadas con el user):
 *   - provider = "LA RED COMERCIAL" (el distribuidor real) → Product.providerId.
 *   - lab = variante "Marca" de la categoría (patrón del catálogo: filtrable
 *     por Marca en BulkPriceUpdate y en los chips del POS).
 *   - price = round2(sinIVA × 1.21)  (precio de venta con IVA).
 *   - Se saltan las filas con precio ≤ 0.
 *   - Mantener el nombre tal cual (trim). upsert por (name + categoryId).
 *
 * Uso (cwd = api/, con DATABASE_URL/DB reachable):
 *   DRY RUN:  npx tsx scripts/load-la-red-comercial.ts --dry-run
 *   FULL:     npx tsx scripts/load-la-red-comercial.ts
 *   Org:      LRC_ORG_SLUG=... npx tsx scripts/load-la-red-comercial.ts
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { basePrisma } from "../src/config/db";

const ORG_SLUG = process.env.LRC_ORG_SLUG || "el-almacen-de-las-mascotas";
const DATA_PATH = path.resolve(process.cwd(), "./scripts/data/la-red-comercial.json");

const VAT = 1.21;
const round2 = (n: number) => Math.round(n * 100) / 100;

interface SheetRow {
  lab: string;
  name: string;
  priceSinIva: number;
}

interface SheetData {
  provider: string;
  category: string;
  products: SheetRow[];
}

// ---------------------------------------------------------------------------
// DB helpers (solo en modo full; mismas convenciones que load-distributor-pdfs)
// ---------------------------------------------------------------------------

async function ensureProvider(orgId: string, name: string): Promise<string> {
  const found = await basePrisma.provider.findFirst({
    where: { name, organizationId: orgId },
  });
  if (found) return found.id;
  const created = await basePrisma.provider.create({
    data: { name, organizationId: orgId },
  });
  return created.id;
}

async function ensureCategory(orgId: string, name: string): Promise<string> {
  const found = await basePrisma.category.findFirst({
    where: { name, organizationId: orgId, parentId: null },
  });
  if (found) return found.id;
  const created = await basePrisma.category.create({
    data: { name, organizationId: orgId, parentId: null },
  });
  return created.id;
}

async function ensureMarcaVariantDef(categoryId: string, orgId: string): Promise<string> {
  const found = await basePrisma.categoryVariantDefinition.findFirst({
    where: { categoryId, name: "Marca", organizationId: orgId },
  });
  if (found) return found.id;
  const created = await basePrisma.categoryVariantDefinition.create({
    data: { categoryId, name: "Marca", organizationId: orgId },
  });
  return created.id;
}

async function ensureMarcaOption(variantDefId: string, orgId: string, value: string): Promise<string> {
  const found = await basePrisma.categoryVariantOption.findFirst({
    where: { variantId: variantDefId, value, organizationId: orgId },
  });
  if (found) return found.id;
  const created = await basePrisma.categoryVariantOption.create({
    data: { variantId: variantDefId, value, organizationId: orgId },
  });
  return created.id;
}

async function upsertProduct(
  orgId: string,
  providerId: string,
  categoryId: string,
  marcaVariantDefId: string,
  row: SheetRow,
  dryRun: boolean,
): Promise<"created" | "updated" | "skipped"> {
  if (row.priceSinIva <= 0) return "skipped";

  const existing = await basePrisma.product.findFirst({
    where: { organizationId: orgId, name: row.name, categoryId },
    include: { variantAssignments: true },
  });

  // Marca (lab) → option + productVariant => producto filtrable por Marca.
  const marcaOptionId = await ensureMarcaOption(marcaVariantDefId, orgId, row.lab);
  const price = round2(row.priceSinIva * VAT);

  if (existing) {
    if (dryRun) return "skipped";
    await basePrisma.product.update({
      where: { id: existing.id },
      data: { price, providerId, categoryId },
    });
    // Re-sync: asegurar que la fila tenga la Marca (lab) correcta y nada más.
    await basePrisma.productVariant.deleteMany({ where: { productId: existing.id } });
    await basePrisma.productVariant.create({
      data: { productId: existing.id, optionId: marcaOptionId, organizationId: orgId },
    });
    return "updated";
  }

  if (dryRun) return "skipped";

  const product = await basePrisma.product.create({
    data: {
      name: row.name,
      price,
      quantity: 0,
      categoryId,
      organizationId: orgId,
      providerId,
    },
  });
  await basePrisma.productVariant.create({
    data: { productId: product.id, optionId: marcaOptionId, organizationId: orgId },
  });
  return "created";
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const data: SheetData = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  console.log(`Mode: ${dryRun ? "DRY RUN (no writes)" : "FULL LOAD"} | org: ${ORG_SLUG}`);
  console.log(`Source: ${DATA_PATH}`);
  console.log(`Total filas: ${data.products.length} | provider: ${data.provider} | category: ${data.category}`);

  const labs = [...new Set(data.products.map((p) => p.lab))];
  const priceMin = Math.min(...data.products.filter((p) => p.priceSinIva > 0).map((p) => p.priceSinIva));
  const priceMax = Math.max(...data.products.map((p) => p.priceSinIva));
  console.log(`Labs (${labs.length}): ${labs.sort().join(" | ")}`);
  console.log(`Precios SIN IVA: min ${priceMin.toFixed(2)} (→ ${round2(priceMin * VAT).toFixed(2)} con IVA) | max ${priceMax.toFixed(2)}`);
  const toSkip = data.products.filter((p) => p.priceSinIva <= 0).length;
  const toLoad = data.products.length - toSkip;
  console.log(`A cargar: ${toLoad} | a saltar (precio<=0): ${toSkip}`);

  if (dryRun) {
    console.log("\nDry run completa. No se escribió nada en la DB.");
    return;
  }

  const org = await basePrisma.organization.findFirst({ where: { slug: ORG_SLUG } });
  if (!org) {
    console.error(`Organization "${ORG_SLUG}" no encontrada. Usá LRC_ORG_SLUG.`);
    process.exit(1);
  }
  console.log(`\nOrganización: ${org.name} (${org.id})`);

  const providerId = await ensureProvider(org.id, data.provider);
  const categoryId = await ensureCategory(org.id, data.category);
  const marcaVariantDefId = await ensureMarcaVariantDef(categoryId, org.id);
  console.log(`Provider: ${data.provider} (${providerId}) | Category: ${data.category} (${categoryId})`);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  for (const row of data.products) {
    try {
      const status = await upsertProduct(org.id, providerId, categoryId, marcaVariantDefId, row, false);
      if (status === "created") created++;
      else if (status === "updated") updated++;
      else skipped++;
    } catch (e: any) {
      console.error(`  ERROR ${row.lab} / ${row.name}: ${e.message}`);
      skipped++;
    }
  }
  console.log(`\n=== DONE: ${created} created, ${updated} updated, ${skipped} skipped/errors ===`);
}

main()
  .catch((err) => {
    console.error("FATAL:", err);
    process.exit(1);
  })
  .finally(async () => {
    await basePrisma.$disconnect();
  });

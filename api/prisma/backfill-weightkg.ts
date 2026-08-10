/**
 * Backfill weightKg from existing product data (sdd/venta-alimento-suelto B-09, D5).
 *
 * Standalone ts-node script — run ON THE VPS (requires PostgreSQL connection).
 * Dry-run is DEFAULT; --apply writes.
 *
 * Usage:
 *   npx ts-node api/prisma/backfill-weightkg.ts --org <slug>
 *   npx ts-node api/prisma/backfill-weightkg.ts --org <slug> --apply
 *
 * Parser order (B-09):
 *   1. description regex: /\d+(?:[.,]\d+)?\s*(?:kg|kilo|kilos?)\b/i — first match
 *   2. "Tamaño" variant option value (join product→option→variantDef name "Tamaño")
 *   3. null → reported as unmatched
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// ---------------------------------------------------------------------------
// Preflight note (spec B-09 NOTE): before finalizing parser heuristics, run
// a quick production query on the VPS to confirm description-vs-Tamaño
// coverage distribution.
//   SELECT COUNT(*) FILTER (WHERE description ~* '\d+\s*kg') as desc_parsed,
//          COUNT(*) FILTER (WHERE description !~* '\d+\s*kg') as desc_missed
//   FROM products WHERE "organizationId" = '<org-id>';
// ---------------------------------------------------------------------------

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

// Import the recompute service (same formula used at runtime).
import { computePriceKgSuelto, resolveEffectiveFactor } from "../src/services/priceLooseService";

// ---- Parser ----

const WEIGHT_REGEX = /(\d+(?:[.,]\d+)?)\s*(?:kg|kilo|kilos?)\b/i;

function parseWeightFromDescription(description: string | null | undefined): number | null {
  if (!description) return null;
  const m = WEIGHT_REGEX.exec(description);
  if (!m) return null;
  // Normalize Spanish decimal comma (7,5 → 7.5)
  const raw = m[1].replace(",", ".");
  const n = parseFloat(raw);
  return isNaN(n) || n <= 0 ? null : n;
}

function parseWeightFromVariantOption(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = WEIGHT_REGEX.exec(value);
  if (!m) return null;
  const raw = m[1].replace(",", ".");
  const n = parseFloat(raw);
  return isNaN(n) || n <= 0 ? null : n;
}

// ---- Types ----

interface ProductRow {
  id: string;
  name: string;
  description: string | null;
  weightKg: number | null;
}

interface ParsedRow {
  id: string;
  name: string;
  source: "description" | "tamaño";
  weightKg: number;
}

interface UnmatchedRow {
  id: string;
  name: string;
  code: string | null;
}

// ---- Main ----

async function main() {
  const args = process.argv.slice(2);
  const orgSlug = args.includes("--org")
    ? args[args.indexOf("--org") + 1]
    : null;
  const apply = args.includes("--apply");

  if (!orgSlug) {
    console.error("Usage: npx ts-node backfill-weightkg.ts --org <slug> [--apply]");
    process.exit(1);
  }

  console.log(`🔍 Backfill weightKg for org slug: ${orgSlug}`);
  console.log(`   Mode: ${apply ? "APPLY (writes)" : "DRY-RUN (preview only)"}`);
  console.log();

  // Resolve org
  const org = await db.organization.findFirst({ where: { slug: orgSlug } });
  if (!org) {
    console.error(`❌ Organization not found: ${orgSlug}`);
    process.exit(1);
  }
  const orgId = org.id;
  console.log(`   Organization: ${org.name} (${orgId})`);

  // Read org PricingSetting for factor
  const setting = await db.pricingSetting.findFirst({
    where: { organizationId: orgId },
    select: { bulkFactor: true },
  });
  const orgBulkFactor = setting?.bulkFactor ?? 1.2;
  console.log(`   Org bulk factor: ${orgBulkFactor}`);

  // Fetch all products for this org
  const products: ProductRow[] = await db.product.findMany({
    where: { organizationId: orgId },
    select: { id: true, name: true, description: true, weightKg: true },
  });
  console.log(`   Total products: ${products.length}`);

  // Only process products WITHOUT weightKg yet
  const needsWeight = products.filter((p) => p.weightKg == null);
  console.log(`   Missing weightKg: ${needsWeight.length}`);

  if (needsWeight.length === 0) {
    console.log("✅ All products already have weightKg. Nothing to do.");
    await db.$disconnect();
    return;
  }

  // ---- Step 1: Parse from description ----
  const parsed: ParsedRow[] = [];
  const remaining: ProductRow[] = [];

  for (const p of needsWeight) {
    const kg = parseWeightFromDescription(p.description);
    if (kg != null) {
      parsed.push({ id: p.id, name: p.name, source: "description", weightKg: kg });
    } else {
      remaining.push(p);
    }
  }
  console.log(`   Parsed from description: ${parsed.length}`);
  console.log(`   Remaining (no description hit): ${remaining.length}`);

  // ---- Step 2: Parse from "Tamaño" variant option ----
  if (remaining.length > 0) {
    // Fetch variant assignments for remaining products where variant def name = "Tamaño"
    const remainingIds = remaining.map((r) => r.id);
    const variantData: Array<{ productId: string; value: string }> =
      await db.$queryRawUnsafe(
        `SELECT pv."productId", cvo.value
         FROM "ProductVariant_" pv
         JOIN "CategoryVariantOption" cvo ON cvo.id = pv."optionId"
         JOIN "CategoryVariantDefinition" cvd ON cvd.id = cvo."variantId"
         WHERE pv."productId" = ANY($1::uuid[])
           AND cvd.name = 'Tamaño'
           AND pv."organizationId" = $2`,
        remainingIds,
        orgId,
      );

    const variantByProduct = new Map<string, string>();
    for (const row of variantData) {
      // First Tamaño value wins per product
      if (!variantByProduct.has(row.productId)) {
        variantByProduct.set(row.productId, row.value);
      }
    }

    const stillRemaining: ProductRow[] = [];
    for (const p of remaining) {
      const variantValue = variantByProduct.get(p.id);
      const kg = parseWeightFromVariantOption(variantValue);
      if (kg != null) {
        parsed.push({ id: p.id, name: p.name, source: "tamaño", weightKg: kg });
      } else {
        stillRemaining.push(p);
      }
    }
    console.log(`   Parsed from Tamaño variant: ${parsed.length - (remaining.length - stillRemaining.length)}`);
    console.log(`   Unmatched (no weight source): ${stillRemaining.length}`);

    // Report unmatched
    if (stillRemaining.length > 0) {
      console.log();
      console.log("⚠️  UNMATCHED PRODUCTS (no weight found in description or Tamaño variant):");
      console.log("   ──────────────────────────────────────────────────────────────");
      for (const p of stillRemaining.slice(0, 20)) {
        const desc = p.description ? `"${p.description.slice(0, 60)}"` : "(sin descripción)";
        console.log(`   ${p.id.slice(0, 8)}… | ${p.name.slice(0, 40)} | ${desc}`);
      }
      if (stillRemaining.length > 20) {
        console.log(`   ... and ${stillRemaining.length - 20} more`);
      }
    }
    console.log();
  }

  // ---- Report parsed results ----
  console.log("📊 PARSED RESULTS:");
  console.log(`   Total parsed: ${parsed.length}`);
  console.log(`   From description: ${parsed.filter((p) => p.source === "description").length}`);
  console.log(`   From Tamaño variant: ${parsed.filter((p) => p.source === "tamaño").length}`);
  console.log();

  if (parsed.length === 0) {
    console.log("✅ No products to backfill.");
    await db.$disconnect();
    return;
  }

  // Sample before/after
  console.log("📋 SAMPLE (first 10):");
  console.log("   Product                     | WeightKg | Factor | Old $/kg | New $/kg");
  console.log("   ────────────────────────────┼──────────┼────────┼──────────┼─────────");

  const recomputeRows: Array<{ id: string; price: number; weightKg: number; bulkFactor: number | null }> = [];

  for (const row of parsed.slice(0, 10)) {
    const product = await db.product.findFirst({
      where: { id: row.id, organizationId: orgId },
      select: { price: true, bulkFactor: true, priceKgSuelto: true },
    });
    if (!product) continue;
    const factor = resolveEffectiveFactor(orgBulkFactor, product.bulkFactor);
    const newPrice = computePriceKgSuelto(Number(product.price), row.weightKg, factor);
    const oldPrice = product.priceKgSuelto ?? null;
    const oldStr = oldPrice != null ? `$${oldPrice.toFixed(2)}` : "—";
    const newStr = newPrice != null ? `$${newPrice.toFixed(2)}` : "—";
    console.log(
      `   ${row.name.slice(0, 26).padEnd(26)} | ${String(row.weightKg).padEnd(8)} | ${factor.toFixed(2).padEnd(6)} | ${oldStr.padEnd(8)} | ${newStr}`,
    );
    recomputeRows.push({ id: row.id, price: Number(product.price), weightKg: row.weightKg, bulkFactor: product.bulkFactor });
  }

  console.log();

  // ---- APPLY or DRY-RUN ----
  if (!apply) {
    console.log("🔒 DRY-RUN: no writes performed. Run with --apply to persist.");
    console.log(`   Would write weightKg for ${parsed.length} products and recompute priceKgSuelto.`);
    console.log();
    console.log("   Run with --apply to execute the backfill:");
    console.log(`   npx ts-node api/prisma/backfill-weightkg.ts --org ${orgSlug} --apply`);
  } else {
    console.log("✍️  APPLYING backfill...");

    // Write weightKg in batches of 100 to avoid long tx
    const BATCH_SIZE = 100;
    let written = 0;
    for (let i = 0; i < parsed.length; i += BATCH_SIZE) {
      const batch = parsed.slice(i, i + BATCH_SIZE);
      await db.$transaction(
        batch.map((row) =>
          db.product.updateMany({
            where: { id: row.id, organizationId: orgId },
            data: { weightKg: row.weightKg },
          }),
        ),
      );
      written += batch.length;
      console.log(`   WeightKg written: ${written}/${parsed.length}`);
    }

    // Recompute priceKgSuelto for ALL parsed products
    console.log("   Recomputing priceKgSuelto...");

    // Collect product data for recompute
    let recomputed = 0;
    for (let i = 0; i < parsed.length; i += BATCH_SIZE) {
      const batch = parsed.slice(i, i + BATCH_SIZE);
      const ids = batch.map((r) => r.id);
      await db.$transaction(async (tx) => {
        const rows = await tx.product.findMany({
          where: { id: { in: ids }, organizationId: orgId },
          select: { id: true, price: true, weightKg: true, bulkFactor: true },
        });
        await Promise.all(
          rows.map((r) => {
            const factor = resolveEffectiveFactor(orgBulkFactor, r.bulkFactor);
            const priceKgSuelto = computePriceKgSuelto(
              Number(r.price),
              r.weightKg,
              factor,
            );
            return tx.product.updateMany({
              where: { id: r.id, organizationId: orgId },
              data: { priceKgSuelto },
            });
          }),
        );
        recomputed += rows.length;
      });
      console.log(`   Recompute: ${recomputed}/${parsed.length}`);
    }

    console.log();
    console.log("✅ Backfill complete!");
    console.log(`   Products updated: ${parsed.length}`);
    console.log(`   WeightKg written + priceKgSuelto recomputed.`);
  }

  await db.$disconnect();
}

main().catch((e) => {
  console.error("❌ Fatal error:", e);
  process.exit(1);
});

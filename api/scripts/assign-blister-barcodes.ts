// Script: assign invented internal barcodes to BLISTER products created
// without one (see api/scripts/create-blister-products.ts header — new
// physical SKUs, no barcode known yet). The owner needs them scannable at
// POS, so we invent a code instead of waiting for a real EAN.
//
// Format: "BLST" + 5-digit zero-padded sequential number (BLST00001, ...).
// Deliberately alphanumeric, NOT a 13-digit numeric string starting with
// "20" — that prefix is reserved for weight-scale PLU labels (see
// api/src/utils/scaleBarcode.ts, SCALE_PREFIX) and would be silently
// misinterpreted as a scale barcode in the product-scan flow
// (api/src/controllers/productController.ts calls parseScaleBarcode()
// before the normal code/barcode lookup).
//
// Business rules:
//  1. Candidate: Product.name matches /BLISTER/i AND barcode is null/empty
//     (shouldAssignBlisterBarcode, idempotent skip if already set).
//  2. Sequence continues from the max BLST##### found across ALL existing
//     barcodes in the org (not just blister ones) — guarantees no collision
//     with any other product's barcode, and reruns pick up where the last
//     run left off.
//  3. A single run assigns distinct sequential codes to every candidate
//     (a batch of 20 gets 20 different codes, not the same one repeated).
//
// Usage (run on VPS via ts-node, see api/prisma/scripts/README.md pattern):
//   TS_NODE_PROJECT=/var/www/pullstok/api/tsconfig.json \
//     npx ts-node --transpile-only scripts/assign-blister-barcodes.ts --dry-run
//   ... --apply
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { shouldAssignBlisterBarcode } from "../prisma/scripts/blisterBarcodeMigration";
import { formatInternalBarcode, nextInternalBarcodeSeq } from "../src/utils/internalBarcode";

const BLISTER_PREFIX = "BLST";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DEFAULT_ORG = "1bc3a6c5-1d06-4e40-93ba-12d51a2a2a1b";

const args = process.argv.slice(2);
const mode = args.includes("--apply") ? "apply" : "dry-run";
const orgIdArg = args.find((a) => !a.startsWith("--"));
const TARGET_ORG = orgIdArg || DEFAULT_ORG;

const BLISTER_RE = /BLISTER/i;

async function main() {
  const blisterProducts = await prisma.product.findMany({
    where: { organizationId: TARGET_ORG, name: { contains: "BLISTER", mode: "insensitive" } },
    select: { id: true, name: true, barcode: true },
    orderBy: { name: "asc" },
  });

  const allBarcodes = await prisma.product.findMany({
    where: { organizationId: TARGET_ORG },
    select: { barcode: true },
  });

  let seq = nextInternalBarcodeSeq(BLISTER_PREFIX, allBarcodes.map((p) => p.barcode));

  const plan: { id: string; name: string; barcode: string | null; newBarcode?: string; skipReason?: string }[] = [];
  for (const p of blisterProducts) {
    if (!shouldAssignBlisterBarcode(p.name, p.barcode)) {
      plan.push({ id: p.id, name: p.name, barcode: p.barcode, skipReason: p.barcode ? "already has a barcode" : "name does not match BLISTER" });
      continue;
    }
    const newBarcode = formatInternalBarcode(BLISTER_PREFIX, seq);
    seq++;
    plan.push({ id: p.id, name: p.name, barcode: p.barcode, newBarcode });
  }

  const toAssign = plan.filter((x) => x.newBarcode);
  const toSkip = plan.filter((x) => !x.newBarcode);

  console.log(`Mode: ${mode}`);
  console.log(`Target org: ${TARGET_ORG}`);
  console.log(`Total BLISTER products: ${blisterProducts.length}`);
  console.log(`Would assign: ${toAssign.length}`);
  console.log(`Would skip:   ${toSkip.length}`);

  if (toSkip.length > 0) {
    console.log("\n=== SKIPPED ===");
    toSkip.forEach((s) => console.log(`  [skip] ${s.name} (${s.skipReason})`));
  }

  console.log("\n=== PLAN ===");
  toAssign.forEach((x) => console.log(`  ${x.name}  ->  ${x.newBarcode}`));

  if (mode !== "apply") {
    console.log("\nDRY-RUN only. No rows written. Re-run with --apply to write.");
    await prisma.$disconnect();
    return;
  }

  console.log("\n=== APPLY MODE ===");
  for (const x of toAssign) {
    await prisma.product.update({ where: { id: x.id }, data: { barcode: x.newBarcode } });
    console.log(`  assigned ${x.newBarcode}  ${x.name}`);
  }
  console.log(`Assigned ${toAssign.length} barcodes.`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});

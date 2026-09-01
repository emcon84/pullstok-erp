/**
 * Asigna `Product.scaleCode` (código interno de balanza, EAN-13 = 20 + scaleCode
 * + peso + verificador) a los productos sueltos de una organización.
 *
 * Esquema: familia por MARCA MADRE (colapsando variantes) + índice de producto.
 *   '<familia 2 dígitos>' + '<índice 2 dígitos>'
 *   PRO PLAN (01) → 0101, 0102...   SIEGER (02) → 0201, 0202...
 *
 * "Marca madre" = marca de la planilla con las variantes colapsadas
 * (se quitan tokens tipo RP/EN/CORDERO/PREMIUM...): "PRO PLAN RP" → "PRO PLAN".
 * El colapso es un heurístico inicial y se puede ajustar/mapear a mano después.
 *
 * Set objetivo: productos de Alimento Seco, con priceKgSuelto > 0 y carried=true
 * (los que el negocio realmente trabaja suelto). Idempotente: re-correrlo
 * sobrescribe scaleCode si ya existe (siempre que no esté en el set se deja).
 *
 * Env/flag:
 *   ORG_SLUG = slug de la organización (default el-almacen-de-las-mascotas)
 *   --apply   = escribe en la BD (sin --apply = dry-run, solo muestra el plan)
 *
 * Usage: npx ts-node scripts/assign-scale-codes.ts [--apply]
 */
import "dotenv/config";
import { basePrisma } from "../src/config/db";
import { findCellForProduct, findAlimentoSecoCategoryIds } from "../src/services/priceMatchingService";

const DEFAULT_ORG_SLUG = "el-almacen-de-las-mascotas";

export const hasApplyFlag = (argv: string[] = process.argv): boolean =>
  argv.includes("--apply");

export const resolveOrgSlug = (env: NodeJS.ProcessEnv = process.env): string =>
  env.ORG_SLUG || DEFAULT_ORG_SLUG;

// ── Colapso de marca madre ──

// Tokens que representan variantes / líneas (no la marca madre) y se descartan
// al derivar la familia. Ajustable: es un heurístico inicial.
const VARIANT_TOKENS = new Set([
  "RP", "EN", "NF", "URINARY", "CORDERO", "SALMON", "POLLO", "TRUCHA", "CERDO",
  "CRIADORES", "CLASSIC", "COMPLETE", "PREMIUM", "SUPER", "GREEN", "LINE",
  "GOLD", "NOVELES", "EQUALIBRIUM", "EQUILIBRIUM", "GASTRO", "OBESITY", "RENAL",
  "CARDIAC", "DIABETIC", "HEPATIC", "GASTROINTESTINAL", "HIPOALERGNICO",
  "HIPOALERGICO", "ARTICULAR", "Y", "ARROZ", "MP", "ROYAL",
]);

/** Marca madre a partir del nombre de marca de la planilla. */
export const parentBrandOf = (name: string): string => {
  const tokens = name.split(/\s+/).filter(Boolean);
  const kept = tokens.filter((t) => !VARIANT_TOKENS.has(t.toUpperCase()));
  return kept.join(" ").trim() || name.trim();
};

export interface AssignableProduct {
  id: string;
  name: string;
  brandName: string;
  parentBrand: string;
}

export interface PlannedCode {
  productId: string;
  scaleCode: string;
  parentBrand: string;
  productName: string;
}

/** Asigna los códigos (función pura, testeable): ordena marcas alfabéticamente. */
export const planScaleCodes = (products: AssignableProduct[]): PlannedCode[] => {
  const byParent = new Map<string, AssignableProduct[]>();
  for (const p of products) {
    const arr = byParent.get(p.parentBrand) ?? [];
    arr.push(p);
    byParent.set(p.parentBrand, arr);
  }

  const parents = [...byParent.keys()].sort((a, b) =>
    a.localeCompare(b, "es", { sensitivity: "base" }),
  );

  const out: PlannedCode[] = [];
  parents.forEach((parent, fi) => {
    const family = String(fi + 1).padStart(2, "0");
    const items = byParent.get(parent)!.sort((a, b) =>
      a.name.localeCompare(b.name, "es", { sensitivity: "base" }),
    );
    items.forEach((p, ii) => {
      const index = String(ii + 1).padStart(2, "0");
      out.push({ productId: p.id, scaleCode: `${family}${index}`, parentBrand: parent, productName: p.name });
    });
  });
  return out;
};

async function main() {
  const apply = hasApplyFlag();
  const slug = resolveOrgSlug();

  const org = await basePrisma.organization.findFirst({ where: { slug } });
  if (!org) throw new Error(`Organización no encontrada (slug='${slug}')`);

  const categories = await basePrisma.category.findMany({
    where: { organizationId: org.id },
    select: { id: true, name: true, parentId: true },
  });
  const secoIds = findAlimentoSecoCategoryIds(categories as any);
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const [brands, types, cells, products] = await Promise.all([
    basePrisma.priceKgBrand.findMany({ where: { organizationId: org.id } }),
    basePrisma.priceKgType.findMany({ where: { organizationId: org.id } }),
    basePrisma.priceKgPrice.findMany({ where: { organizationId: org.id } }),
    basePrisma.product.findMany({
      where: {
        organizationId: org.id,
        categoryId: { in: secoIds },
        carried: true,
        priceKgSuelto: { gt: 0 },
      },
      select: { id: true, name: true, categoryId: true, priceKgSuelto: true },
    }),
  ]);

  const assignable: AssignableProduct[] = [];
  let skippedNoBrand = 0;
  for (const p of products) {
    const { ctx } = findCellForProduct(
      p as any,
      brands as any,
      types as any,
      categoryById as any,
      cells as any,
    );
    const brandName = ctx.brand.brand?.name;
    if (!brandName) {
      skippedNoBrand++;
      continue;
    }
    assignable.push({ id: p.id, name: p.name, brandName, parentBrand: parentBrandOf(brandName) });
  }

  const plan = planScaleCodes(assignable);

  if (apply) {
    let updated = 0;
    await basePrisma.$transaction(async (tx) => {
      for (const row of plan) {
        const res = await tx.product.updateMany({
          where: { id: row.productId, organizationId: org.id },
          data: { scaleCode: row.scaleCode },
        });
        updated += res.count;
      }
    });
    console.log(`[${org.name}] ${updated} productos actualizados con scaleCode.`);
  } else {
    console.log(`DRY-RUN [${org.name}] — sin --apply no se escribe nada.\n`);
    console.log(`Set: ${products.length} productos sueltos, ${assignable.length} con marca resuelta, ${skippedNoBrand} sin marca.\n`);
    console.log("Plan (por marca madre):");
    const byParent = new Map<string, { code: string; name: string }[]>();
    for (const row of plan) {
      const arr = byParent.get(row.parentBrand) ?? [];
      arr.push({ code: row.scaleCode, name: row.productName });
      byParent.set(row.parentBrand, arr);
    }
    for (const [parent, items] of byParent) {
      console.log(`  ${parent}: ${items.map((i) => `${i.code}=${i.name}`).join(", ")}`);
    }
  }
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

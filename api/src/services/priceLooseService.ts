import { round2 } from "../utils/money";

/**
 * Servicio de recompute del precio suelto (sdd/venta-alimento-suelto, D3).
 *
 * Todas las funciones con `tx`/`client` inyectado corren DENTRO del
 * $transaction del llamador (bulk-price-update, factor save, product PUT) o
 * con basePrisma + organizationId explícito (CSV import, fuera del ALS).
 * El orgId se pasa explícito donde el scope automático de la extensión no
 * aplica (PricingSetting NO es TENANT_MODEL → filtrar por organizationId).
 */
export const DEFAULT_BULK_FACTOR = 1.2;

/** COALESCE(product.bulkFactor, org.bulkFactor, 1.20) — factor default de la org. */
export const resolveEffectiveFactor = (
  orgBulkFactor: number | null | undefined,
  productBulkFactor: number | null | undefined,
): number => {
  if (typeof productBulkFactor === "number" && productBulkFactor > 0) {
    return productBulkFactor;
  }
  if (typeof orgBulkFactor === "number" && orgBulkFactor > 0) {
    return orgBulkFactor;
  }
  return DEFAULT_BULK_FACTOR;
};

/**
 * priceKgSuelto = round2(price / weightKg × effectiveFactor) — UN solo round
 * al final, precisión interna completa (B-04). null a menos que price>0 &&
 * weightKg>0 (producto NO elegible).
 */
export const computePriceKgSuelto = (
  price: number,
  weightKg: number | null | undefined,
  factor: number,
): number | null => {
  if (!(price > 0) || !(typeof weightKg === "number" && weightKg > 0) || !(factor > 0)) {
    return null;
  }
  return round2((price / weightKg) * factor);
};

/** Loose-eligible iff priceKgSuelto > 0 (sin flag ni restricción de categoría). */
export const isLooseEligible = (p: {
  priceKgSuelto?: number | null;
}): boolean => (p.priceKgSuelto ?? 0) > 0;

interface RecomputeRow {
  id: string;
  name?: string;
  price: number;
  weightKg: number | null;
  bulkFactor: number | null;
  priceKgSuelto?: number | null;
  priceKgSueltoManual?: boolean;
}

/** Lee el factor org (PricingSetting) o el default si no hay fila. */
const readOrgBulkFactor = async (
  tx: any,
  orgId: string,
): Promise<number> => {
  const setting = await tx.pricingSetting.findFirst({
    where: { organizationId: orgId },
    select: { bulkFactor: true },
  });
  return typeof setting?.bulkFactor === "number" && setting.bulkFactor > 0
    ? setting.bulkFactor
    : DEFAULT_BULK_FACTOR;
};

/** Escribe un priceKgSuelto por fila (updateMany org-scoped, in-tx). */
const writeRows = async (
  tx: any,
  orgId: string,
  rows: RecomputeRow[],
  factor: number,
): Promise<number> => {
  await Promise.all(
    rows.map((r) =>
      tx.product.updateMany({
        where: { id: r.id, organizationId: orgId },
        data: {
          priceKgSuelto: computePriceKgSuelto(
            Number(r.price),
            r.weightKg ?? null,
            factor,
          ),
        },
      }),
    ),
  );
  return rows.length;
};

/**
 * B-05a — Factor save (admin "Configuración de precios"): recomputes ONLY the
 * products with bulkFactor IS NULL AND priceKgSueltoManual=false (both product
 * overrides and hand-set per-kg prices stay intact). Runs inside the same
 * $transaction as the factor upsert.
 * Double guarantee: the selector filters both bulkFactor IS NULL and
 * priceKgSueltoManual=false, and the loop defensively skips any row with an
 * override or manual flag that somehow reaches the set (B-05a).
 *
 * `opts.preview` (dry-run de la pantalla A-01): resuelve el MISMO set pero NO
 * escribe — devuelve affected + una muestra before/after para el preview.
 */
export interface FactorSavePreviewRow {
  id: string;
  name: string;
  oldKgPrice: number | null;
  newKgPrice: number | null;
}

export const recomputeForFactorSave = async (
  tx: any,
  orgId: string,
  factor: number,
  opts?: { preview?: boolean; sampleSize?: number },
): Promise<{ affected: number; sample?: FactorSavePreviewRow[] }> => {
  const rows: Array<RecomputeRow & { name: string }> = await tx.product.findMany({
    where: { organizationId: orgId, bulkFactor: null, priceKgSueltoManual: false },
    select: {
      id: true,
      name: true,
      price: true,
      weightKg: true,
      bulkFactor: true,
      priceKgSuelto: true,
      priceKgSueltoManual: true,
    },
  });
  // Defensive: never write a row with a per-product override or a manual
  // per-kg price during a factor save — even though the selector already
  // excludes them, this net protects against future where refactors.
  const factorRows = rows.filter(
    (r) => r.bulkFactor == null && r.priceKgSueltoManual !== true,
  );

  if (opts?.preview) {
    const sampleSize = opts.sampleSize ?? 10;
    const sample = factorRows.slice(0, sampleSize).map((r) => ({
      id: r.id,
      name: r.name ?? r.id,
      oldKgPrice:
        r.priceKgSuelto != null && typeof (r as any).priceKgSuelto === "number"
          ? ((r as any).priceKgSuelto as number)
          : null,
      newKgPrice: computePriceKgSuelto(Number(r.price), r.weightKg ?? null, factor),
    }));
    return { affected: factorRows.length, sample };
  }

  const affected = await writeRows(tx, orgId, factorRows, factor);
  return { affected };
};

/**
 * B-05b — Product PUT: recomputa UN producto con su factor efectivo
 * (override propio > org > default). Respeta el flag priceKgSueltoManual:
 * si el producto tiene un precio por kg fijado a mano, NO escribe nada y
 * devuelve el valor almacenado (decisión: "manual gana").
 */
export const recomputeForProduct = async (
  tx: any,
  productId: string,
): Promise<{ affected: number; priceKgSuelto: number | null }> => {
  const product = await tx.product.findFirst({
    where: { id: productId },
    select: {
      id: true,
      price: true,
      weightKg: true,
      bulkFactor: true,
      organizationId: true,
      priceKgSuelto: true,
      priceKgSueltoManual: true,
    },
  });
  if (!product) return { affected: 0, priceKgSuelto: null };

  // Manual override wins: skip the recompute and keep the stored value.
  if (product.priceKgSueltoManual) {
    return { affected: 0, priceKgSuelto: product.priceKgSuelto ?? null };
  }

  const factor =
    typeof product.bulkFactor === "number" && product.bulkFactor > 0
      ? product.bulkFactor
      : await readOrgBulkFactor(tx, product.organizationId);

  const priceKgSuelto = computePriceKgSuelto(
    Number(product.price),
    product.weightKg ?? null,
    factor,
  );

  await tx.product.updateMany({
    where: { id: productId, organizationId: product.organizationId },
    data: { priceKgSuelto },
  });
  return { affected: 1, priceKgSuelto };
};

/**
 * B-05c — Bulk price update: se llama DENTRO del $transaction de
 * bulk-price-update (productController) DESPUÉS de los writes de precio, sobre
 * el MISMO set resuelto (`where` de buildBulkPriceWhere). Recomputa con el
 * factor efectivo por fila (overrides respetados en la misma corrida).
 * Excluye los productos con priceKgSueltoManual=true: un precio por kg fijado
 * a mano nunca es recalculado (decisión: "manual gana").
 */
export const recomputeForBulkPriceUpdate = async (
  tx: any,
  where: object,
  orgId: string,
): Promise<{ affected: number }> => {
  const rows: RecomputeRow[] = await tx.product.findMany({
    where: Object.assign(
      { organizationId: orgId, priceKgSueltoManual: false },
      where,
    ),
    select: {
      id: true,
      price: true,
      weightKg: true,
      bulkFactor: true,
      priceKgSueltoManual: true,
    },
  });

  const orgFactor = await readOrgBulkFactor(tx, orgId);
  let affected = 0;

  await Promise.all(
    rows.map((r) => {
      const factor = resolveEffectiveFactor(orgFactor, r.bulkFactor ?? null);
      return tx.product
        .updateMany({
          where: { id: r.id, organizationId: orgId },
          data: {
            priceKgSuelto: computePriceKgSuelto(
              Number(r.price),
              r.weightKg ?? null,
              factor,
            ),
          },
        })
        .then(() => {
          affected++;
        });
    }),
  );

  return { affected };
};

/**
 * B-05d — CSV import: corre fuera del ALS (callback de stream) → basePrisma +
 * organizationId explícito en TODA query (B-10). Excluye los productos con
 * priceKgSueltoManual=true: un precio por kg fijado a mano nunca es
 * recalculado por la importación (decisión: "manual gana").
 */
export const recomputeForCsvImport = async (
  client: any,
  orgId: string,
  productIds: string[],
): Promise<{ affected: number }> => {
  if (productIds.length === 0) return { affected: 0 };

  const rows: RecomputeRow[] = await client.product.findMany({
    where: {
      organizationId: orgId,
      id: { in: productIds },
      priceKgSueltoManual: false,
    },
    select: {
      id: true,
      price: true,
      weightKg: true,
      bulkFactor: true,
      priceKgSueltoManual: true,
    },
  });

  const orgFactor = await readOrgBulkFactor(client, orgId);
  let affected = 0;

  await Promise.all(
    rows.map((r) => {
      const factor = resolveEffectiveFactor(orgFactor, r.bulkFactor ?? null);
      return client.product
        .updateMany({
          where: { id: r.id, organizationId: orgId },
          data: {
            priceKgSuelto: computePriceKgSuelto(
              Number(r.price),
              r.weightKg ?? null,
              factor,
            ),
          },
        })
        .then(() => {
          affected++;
        });
    }),
  );

  return { affected };
};

export default {
  resolveEffectiveFactor,
  computePriceKgSuelto,
  isLooseEligible,
  recomputeForFactorSave,
  recomputeForProduct,
  recomputeForBulkPriceUpdate,
  recomputeForCsvImport,
  DEFAULT_BULK_FACTOR,
};
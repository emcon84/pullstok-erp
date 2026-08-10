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
  price: number;
  weightKg: number | null;
  bulkFactor: number | null;
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
 * B-05a — Factor save (admin "Configuración de precios"): recomputa SOLO los
 * productos con bulkFactor IS NULL (los overrides por producto quedan
 * intactos). Corre dentro del mismo $transaction del upsert del factor.
 * Doble garantía: el selector pide bulkFactor IS NULL Y el loop saltea
 * defensivamente cualquier fila con override que llegara al set (B-05a).
 */
export const recomputeForFactorSave = async (
  tx: any,
  orgId: string,
  factor: number,
): Promise<{ affected: number }> => {
  const rows: RecomputeRow[] = await tx.product.findMany({
    where: { organizationId: orgId, bulkFactor: null },
    select: { id: true, price: true, weightKg: true, bulkFactor: true },
  });
  // Defensive: nunca escribir una fila con override por producto en un factor
  // save — aunque el selector ya lo excluye, esta red protege de futuros
  // refactors del where.
  const factorRows = rows.filter((r) => r.bulkFactor == null);
  const affected = await writeRows(tx, orgId, factorRows, factor);
  return { affected };
};

/**
 * B-05b — Product PUT: recomputa UN producto con su factor efectivo
 * (override propio > org > default).
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
    },
  });
  if (!product) return { affected: 0, priceKgSuelto: null };

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
 */
export const recomputeForBulkPriceUpdate = async (
  tx: any,
  where: object,
  orgId: string,
): Promise<{ affected: number }> => {
  const rows: RecomputeRow[] = await tx.product.findMany({
    where: Object.assign({ organizationId: orgId }, where),
    select: { id: true, price: true, weightKg: true, bulkFactor: true },
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
 * organizationId explícito en TODA query (B-10).
 */
export const recomputeForCsvImport = async (
  client: any,
  orgId: string,
  productIds: string[],
): Promise<{ affected: number }> => {
  if (productIds.length === 0) return { affected: 0 };

  const rows: RecomputeRow[] = await client.product.findMany({
    where: { organizationId: orgId, id: { in: productIds } },
    select: { id: true, price: true, weightKg: true, bulkFactor: true },
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
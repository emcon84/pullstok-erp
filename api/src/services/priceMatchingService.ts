import { isLooseEligible } from "./priceLooseService";

/**
 * Motor de matching planilla ↔ productos (sdd/precios-suelto-planilla).
 *
 * La planilla de precios por kilo (marca × tipo × especie → precio/kg) es la
 * fuente autoritativa del precio suelto. Este service normaliza nombres de
 * producto, resuelve marca/etapa/especie y decide si un producto se auto-
 * matchea con una celda (match EXACTO → se escribe priceKgSuelto) o cae a la
 * cola de revisión (fuzzy, manual protegido, marca sin planilla, celda
 * huérfana).
 *
 * autoApply(tx, orgId) corre DENTRO del $transaction del controller
 * (patrón recomputeForFactorSave de priceLooseService): el tx no hereda el
 * scope automático anti-fuga, así que organizationId se pasa EXPLÍCITO en
 * toda query.
 */

export type Species = "PERRO" | "GATO" | "AMBOS";

// ── Formas mínimas (parciales) que consumen las funciones ──

interface BrandLike {
  id: string;
  name: string;
  keywords: string[];
}

interface TypeLike {
  id: string;
  name: string;
  synonyms: string[];
}

interface CategoryLike {
  id: string;
  name: string;
  parentId: string | null;
}

interface CellLike {
  id: string;
  brandId: string;
  typeId: string;
  species: Species;
  priceKg: number;
}

interface ProductLike {
  id: string;
  name: string;
  categoryId: string | null;
  priceKgSuelto?: number | null;
  priceKgSueltoManual?: boolean;
}

export interface BrandResolve {
  brand?: BrandLike;
  exact: boolean;
}

export interface TypeResolve {
  type?: TypeLike;
  exact: boolean;
}

// ── Normalización ──

/** NFD decompose → lowercase → strip acentos → collapse whitespace. */
export const normalizeName = (name: string): string =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");

// ── Levenshtein (fuzzy ≤ 2) ──

/** Distancia de edición Levenshtein (DP de dos filas). */
export const levenshtein = (a: string, b: string): number => {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1, // delete
        curr[j - 1] + 1, // insert
        prev[j - 1] + cost, // substitute
      );
    }
    prev = curr;
  }
  return prev[b.length];
};

/** Fuzzy match: distancia Levenshtein ≤ 2 (typos evidentes, ej. MEDIAMA→MEDIANA). */
export const matchFuzzy = (a: string, b: string): boolean =>
  levenshtein(a, b) <= 2;

// ── Resolución de marca ──

/**
 * Resuelve la marca de la planilla desde el nombre normalizado del producto:
 * 1) prefijo del nombre (extracción de marca: "PRO PLAN ADULTO..." → PRO PLAN),
 * 2) keyword de la marca como token (PROPLAN → PRO PLAN, BALANCED → BALANCE),
 * 3) fuzzy ≤ 2 contra el nombre de marca. Devuelve `exact:false` en el caso
 * fuzzy para que el caller decida entre auto-apply y cola.
 */
export const resolveBrand = (
  normalizedName: string,
  brands: BrandLike[],
): BrandResolve => {
  const tokens = normalizedName.split(" ").filter(Boolean);

  for (const b of brands) {
    const normName = normalizeName(b.name);
    if (normName && normalizedName.startsWith(normName)) {
      return { brand: b, exact: true };
    }
    for (const kw of b.keywords) {
      const normKw = normalizeName(kw);
      if (normKw && tokens.includes(normKw)) {
        return { brand: b, exact: true };
      }
    }
  }

  // Fuzzy sobre el nombre de marca (typo en la marca).
  let best: BrandResolve = { exact: false };
  let bestDist = 3;
  for (const b of brands) {
    const normName = normalizeName(b.name);
    if (!normName) continue;
    for (const token of tokens) {
      const d = levenshtein(token, normName);
      if (d <= 2 && d < bestDist) {
        bestDist = d;
        best = { brand: b, exact: false };
      }
    }
  }
  return best;
};

// ── Resolución de etapa (tipo) ──

/**
 * Resuelve la etapa (PriceKgType) desde los tokens restantes del nombre
 * (descontando los tokens de la marca resuelta): nombre exacto, sinónimo
 * (Kitten → Gatito, ADULT → Adulto) y fuzzy ≤ 2 como fallback.
 */
export const resolveType = (
  normalizedName: string,
  types: TypeLike[],
  brandName?: string,
): TypeResolve => {
  let tokens = normalizedName.split(" ").filter(Boolean);

  if (brandName) {
    const brandTokens = normalizeName(brandName).split(" ").filter(Boolean);
    const remaining = [...tokens];
    for (const bt of brandTokens) {
      const idx = remaining.indexOf(bt);
      if (idx >= 0) remaining.splice(idx, 1);
    }
    tokens = remaining;
  }

  // Exacto: token == nombre o sinónimo del tipo.
  for (const t of types) {
    const normName = normalizeName(t.name);
    if (normName && tokens.includes(normName)) {
      return { type: t, exact: true };
    }
    for (const syn of t.synonyms) {
      const normSyn = normalizeName(syn);
      if (normSyn && tokens.includes(normSyn)) {
        return { type: t, exact: true };
      }
    }
  }

  // Fuzzy ≤ 2 contra nombre/sinónimos (typo en la etapa).
  let best: TypeResolve = { exact: false };
  let bestDist = 3;
  for (const t of types) {
    const candidates = [normalizeName(t.name), ...t.synonyms.map(normalizeName)]
      .filter(Boolean);
    for (const candidate of candidates) {
      for (const token of tokens) {
        const d = levenshtein(token, candidate);
        if (d <= 2 && d < bestDist) {
          bestDist = d;
          best = { type: t, exact: false };
        }
      }
    }
  }
  return best;
};

// ── Especie desde la categoría ──

/**
 * Especie del producto a partir de su categoría y la categoría padre
 * ("Alimento Seco > Perro" → PERRO, "Alimento Seco > Gato" → GATO, sin
 * indicio → AMBOS).
 */
export const resolveSpeciesFromCategory = (
  categoryName?: string | null,
  parentName?: string | null,
): Species => {
  const haystack = normalizeName(`${parentName ?? ""} ${categoryName ?? ""}`);
  if (haystack.includes("perro")) return "PERRO";
  if (haystack.includes("gato")) return "GATO";
  return "AMBOS";
};

export { isLooseEligible };

// ── Categorías de Alimento Seco ──

/**
 * Ids de categorías de "Alimento Seco": la raíz misma + sus hijos directos
 * (Perro, Gato, ...). El matching solo corre sobre productos de estas
 * categorías (out of scope: húmedo, otros).
 */
export const findAlimentoSecoCategoryIds = (
  categories: CategoryLike[],
): string[] => {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const ids = new Set<string>();
  for (const c of categories) {
    const norm = normalizeName(c.name);
    if (norm === "alimento seco") {
      ids.add(c.id);
      continue;
    }
    const parent = c.parentId ? byId.get(c.parentId) : undefined;
    if (parent && normalizeName(parent.name) === "alimento seco") {
      ids.add(c.id);
    }
  }
  return [...ids];
};

// ── Clasificación producto → celda ──

interface ProductContext {
  species: Species;
  brand: BrandResolve;
  type: TypeResolve;
}

/** Resuelve especie + marca + etapa de un producto (contexto de matching). */
export const classifyProduct = (
  product: ProductLike,
  brands: BrandLike[],
  types: TypeLike[],
  categoryById: Map<string, CategoryLike>,
): ProductContext => {
  const cat = product.categoryId
    ? categoryById.get(product.categoryId)
    : undefined;
  const parent = cat?.parentId
    ? categoryById.get(cat.parentId)
    : undefined;
  const species = resolveSpeciesFromCategory(cat?.name, parent?.name);
  const normalized = normalizeName(product.name);
  const brand = resolveBrand(normalized, brands);
  const type = resolveType(normalized, types, brand.brand?.name);
  return { species, brand, type };
};

/** Celda de la planilla que matchea el producto (misma marca+tipo+especie), si hay. */
export const findCellForProduct = (
  product: ProductLike,
  brands: BrandLike[],
  types: TypeLike[],
  categoryById: Map<string, CategoryLike>,
  cells: CellLike[],
): { ctx: ProductContext; cell: CellLike | null } => {
  const ctx = classifyProduct(product, brands, types, categoryById);
  const cell =
    ctx.brand.brand && ctx.type.type
      ? (cells.find(
          (c) =>
            c.brandId === ctx.brand.brand!.id &&
            c.typeId === ctx.type.type!.id &&
            c.species === ctx.species,
        ) ?? null)
      : null;
  return { ctx, cell };
};

// ── Auto-apply (dentro de $transaction del controller) ──

export interface AutoApplyResult {
  applied: number;
  queued: number;
  skipped: number;
}

interface QueueEntryData {
  productId: string | null;
  priceKgPriceId: string | null;
  brandId: string | null;
  typeId: string | null;
  species: Species;
  reason: "FUZZY_MATCH" | "MANUAL_OVERRIDE" | "ORPHAN_CELL" | "BRAND_NO_PLANILLA";
  oldPriceKg: number | null;
  newPriceKg: number | null;
  organizationId: string;
}

const queueEntry = (
  data: QueueEntryData,
): { data: QueueEntryData & { status: "PENDING" } } => ({
  data: { ...data, status: "PENDING" },
});

/**
 * Corre el matching completo de la org:
 * 1. Lee categorías (Alimento Seco), marcas, tipos, celdas y productos.
 * 2. Por producto: manual → cola MANUAL_OVERRIDE (precio intacto); match
 *    EXACTO → escribe priceKgSuelto de la celda; FUZZY → cola FUZZY_MATCH;
 *    marca/etapa sin celda → cola BRAND_NO_PLANILLA; sin cobertura → skipped.
 * 3. Celdas sin producto matcheado → cola ORPHAN_CELL.
 *
 * Doble garantía anti-sobrescritura de manuales: el write usa updateMany con
 * priceKgSueltoManual:false en el where (guardia a nivel DB) además del check
 * defensivo en el loop. Si el update devuelve count 0 (carrera con un edit
 * manual), el producto se protege con una entrada MANUAL_OVERRIDE.
 */
export const autoApply = async (
  tx: any,
  orgId: string,
): Promise<AutoApplyResult> => {
  const categories: CategoryLike[] = await tx.category.findMany({
    where: { organizationId: orgId },
    select: { id: true, name: true, parentId: true },
  });
  const secoIds = findAlimentoSecoCategoryIds(categories);
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const [brands, types, cells, products] = await Promise.all([
    tx.priceKgBrand.findMany({ where: { organizationId: orgId } }) as Promise<BrandLike[]>,
    tx.priceKgType.findMany({ where: { organizationId: orgId } }) as Promise<TypeLike[]>,
    tx.priceKgPrice.findMany({ where: { organizationId: orgId } }) as Promise<CellLike[]>,
    tx.product.findMany({
      where: { organizationId: orgId, categoryId: { in: secoIds } },
      select: {
        id: true,
        name: true,
        categoryId: true,
        priceKgSuelto: true,
        priceKgSueltoManual: true,
      },
    }) as Promise<ProductLike[]>,
  ]);

  let applied = 0;
  let queued = 0;
  let skipped = 0;
  const matchedCellIds = new Set<string>();

  for (const product of products) {
    const { ctx, cell } = findCellForProduct(
      product,
      brands,
      types,
      categoryById,
      cells,
    );
    if (cell) matchedCellIds.add(cell.id);

    const base = {
      productId: product.id,
      priceKgPriceId: cell?.id ?? null,
      brandId: ctx.brand.brand?.id ?? null,
      typeId: ctx.type.type?.id ?? null,
      species: ctx.species,
      oldPriceKg: product.priceKgSuelto ?? null,
      organizationId: orgId,
    };

    // ── Manual protegido: NUNCA se auto-matchea (decisión 1 del cambio) ──
    if (product.priceKgSueltoManual === true) {
      await tx.reviewQueueEntry.create(
        queueEntry({
          ...base,
          reason: "MANUAL_OVERRIDE",
          newPriceKg: cell?.priceKg ?? null,
        }),
      );
      queued++;
      continue;
    }

    // ── Match EXACTO: se propaga el precio de la celda ──
    if (cell && ctx.brand.exact && ctx.type.exact) {
      const res = await tx.product.updateMany({
        where: {
          id: product.id,
          organizationId: orgId,
          priceKgSueltoManual: false,
        },
        data: { priceKgSuelto: cell.priceKg },
      });
      if (res.count === 0) {
        // El producto se volvió manual entre la lectura y el write (carrera):
        // proteger igual que un manual.
        await tx.reviewQueueEntry.create(
          queueEntry({
            ...base,
            reason: "MANUAL_OVERRIDE",
            newPriceKg: cell.priceKg,
          }),
        );
        queued++;
      } else {
        applied++;
      }
      continue;
    }

    // ── Fuzzy: marca o etapa con Levenshtein ≤ 2 → revisión ──
    if (cell) {
      await tx.reviewQueueEntry.create(
        queueEntry({
          ...base,
          reason: "FUZZY_MATCH",
          newPriceKg: cell.priceKg,
        }),
      );
      queued++;
      continue;
    }

    // ── Marca/etapa resuelta pero sin celda para el combo → revisión ──
    if (ctx.brand.brand || ctx.type.type) {
      await tx.reviewQueueEntry.create(
        queueEntry({
          ...base,
          reason: "BRAND_NO_PLANILLA",
          newPriceKg: null,
        }),
      );
      queued++;
      continue;
    }

    skipped++;
  }

  // ── Celdas huérfanas: sin producto matcheado (exacto ni fuzzy) ──
  for (const cell of cells) {
    if (!matchedCellIds.has(cell.id) && cell.priceKg > 0) {
      await tx.reviewQueueEntry.create(
        queueEntry({
          productId: null,
          priceKgPriceId: cell.id,
          brandId: cell.brandId,
          typeId: cell.typeId,
          species: cell.species,
          reason: "ORPHAN_CELL",
          oldPriceKg: null,
          newPriceKg: cell.priceKg,
          organizationId: orgId,
        }),
      );
      queued++;
    }
  }

  return { applied, queued, skipped };
};

// ── Productos que matchean una celda (GET /price-kg-products) ──

export interface CellMatch {
  product: ProductLike;
  exact: boolean;
}

/**
 * Productos de Alimento Seco que matchean la celda dada (misma marca+tipo+
 * especie, exacta o fuzzy), ordenados por relevancia: match exacto primero.
 * Puro → testeable sin mockear prisma.
 */
export const matchProductsForCell = (
  products: ProductLike[],
  brands: BrandLike[],
  types: TypeLike[],
  categories: CategoryLike[],
  cell: { brandId: string; typeId: string; species: Species },
): CellMatch[] => {
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const result: CellMatch[] = [];
  for (const product of products) {
    const { ctx } = findCellForProduct(product, brands, types, categoryById, []);
    if (
      ctx.brand.brand?.id === cell.brandId &&
      ctx.type.type?.id === cell.typeId &&
      ctx.species === cell.species
    ) {
      result.push({ product, exact: ctx.brand.exact && ctx.type.exact });
    }
  }
  return result.sort((a, b) => Number(b.exact) - Number(a.exact));
};

export default {
  normalizeName,
  levenshtein,
  matchFuzzy,
  resolveBrand,
  resolveType,
  resolveSpeciesFromCategory,
  isLooseEligible,
  findAlimentoSecoCategoryIds,
  classifyProduct,
  findCellForProduct,
  autoApply,
  matchProductsForCell,
};

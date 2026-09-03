// Snapshot en memoria del catálogo de productos del bot de WhatsApp.
//
// POR QUÉ EXISTE (el problema que resuelve): la FASE 4 consultaba la DB y,
// encima, re-clasificaba cientos de productos con fuzzy matching (Levenshtein
// contra 93 marcas × 8 tipos vía classifyProduct) en CADA mensaje del cliente.
// El benchmark en el VPS confirmó que las queries individuales son rápidas
// (1–5 ms) pero la re-clasificación se volvía O(n·m) por interacción, porque
// bolsaProducts() (y el resto de la navegación) re-consultaba marca/etapa y
// re-corrría classifyProduct para volver a resolver especie+marca+etapa.
//
// SOLUCIÓN: cargar TODO lo que el flujo necesita UNA vez (con TTL) y
// PRECLASIFICAR cada producto al cargar, guardando su especie/marca/etapa
// resueltas. Después el bot solo FILTRA por ids ya resueltos: sin Levenshtein
// por mensaje y sin pegarle a la DB en cada interacción. El stock (que sí
// cambia) queda en una consulta mínima aparte, ver whatsappCatalog.ts.
//
// MULTI-TENANT: el bot corre para UNA org (KAPSO_ORG_SLUG). El snapshot se carga
// para esa org vía basePrisma con where EXPLÍCITO por organizationId — NO se usa
// el `prisma` scopeado (que lanzaría "sin contexto de org" en el job periódico
// del server y cuyo scope depende del request). Mismo patrón multi-tenant que
// whatsappReactivation.ts. Así el snapshot se puede cargar tanto dentro de una
// request como desde el scheduler del server sin asumir contexto de tenant.

import { basePrisma } from "../config/db";
import { classifyProduct, normalizeName, type Species } from "./priceMatchingService";

// ---------------------------------------------------------------------------
// Tipos del snapshot
// ---------------------------------------------------------------------------

export type SpeciesKey = "perro" | "gato";

export interface SnapshotBrand {
  id: string;
  name: string;
  keywords: string[];
  species: SpeciesKey[];
}

export interface SnapshotStage {
  id: string;
  name: string;
  synonyms: string[];
  species: SpeciesKey[];
  sortOrder: number;
}

export interface SnapshotCell {
  id: string;
  brandId: string;
  typeId: string;
  species: SpeciesKey;
  priceKg: number;
}

export interface SnapshotProduct {
  id: string;
  name: string;
  price: number;
  priceKgSuelto: number | null;
  categoryId: string | null;
  // Pre-clasificados (resueltos por classifyProduct UNA vez al cargar):
  species: SpeciesKey;
  brandId: string | null;
  typeId: string | null;
}

export interface CatalogSnapshot {
  categories: { id: string; name: string; parentId: string | null }[];
  brands: SnapshotBrand[];
  stages: SnapshotStage[];
  cells: SnapshotCell[];
  products: SnapshotProduct[];
  secoCategoryIds: string[];
}

/** Forma de una opción de bolsa que el bot muestra (ver ProductSelection). */
export interface SnapshotProductSelection {
  type: "bolsa";
  id: string;
  label: string;
  price: number;
  priceKg: number | null;
}

// ---------------------------------------------------------------------------
// Mapeos de especie (enum de la planilla ⇄ claves del bot)
// ---------------------------------------------------------------------------

/** Especie enum (PERRO/GATO/AMBOS) → claves del bot. AMBOS aplica a ambas. */
const speciesKeysForEnum = (s: Species): SpeciesKey[] => {
  if (s === "PERRO") return ["perro"];
  if (s === "GATO") return ["gato"];
  return ["perro", "gato"];
};

/**
 * Ids de categorías de "Alimento Seco" tolerante al nombre del catálogo real.
 *
 * El catálogo usa nombres como "Alimento Seco (Balanceado)", no "Alimento Seco"
 * exacto (lo que espera findAlimentoSecoCategoryIds del motor de matching). Este
 * helper del SNAPSHOT busca por substring normalizado "alimento seco" para no
 * depender del sufijo entre paréntesis. Es LOCAL al bot (no toca el matcher del
 * ERP, que se deja como está para no arriesgar regresión en planilla↔productos).
 */
const secoCategoryIdsForBot = (
  categories: { id: string; name: string; parentId: string | null }[],
): string[] => {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const isSeco = (name: string | null | undefined) =>
    !!name && normalizeName(name).includes("alimento seco");
  const ids = new Set<string>();
  for (const c of categories) {
    if (isSeco(c.name)) {
      ids.add(c.id);
      continue;
    }
    const parent = c.parentId ? byId.get(c.parentId) : undefined;
    if (parent && isSeco(parent.name)) ids.add(c.id);
  }
  return [...ids];
};

/**
 * Especie enum → clave única del bot (perro/gato).
 * Devuelve null para AMBOS: un producto sin especie clara en su categoría no
 * puede anclarse honestamente a perro o gato (mostrar la selección ambigua sería
 * inventar una especie). En el catálogo VENDIBLE de alimento seco no debería
 * ocurrir; si pasa, se omite con un warn en logs.
 */
const speciesKeyForEnum = (s: Species): SpeciesKey | null => {
  if (s === "PERRO") return "perro";
  if (s === "GATO") return "gato";
  return null;
};

// ---------------------------------------------------------------------------
// Carga del snapshot
// ---------------------------------------------------------------------------

/** Resuelve el organizationId de la org activa por KAPSO_ORG_SLUG. */
const resolveOrgId = async (): Promise<string | null> => {
  const slug = process.env.KAPSO_ORG_SLUG;
  if (!slug) return null;
  const org = await basePrisma.organization.findFirst({
    where: { slug, isActive: true },
    select: { id: true },
  });
  return org?.id ?? null;
};

/**
 * Lee de la DB todo lo que el flujo necesita y PRECLASIFICA cada producto
 * de bolsa (carried=true) con classifyProduct. Devuelve el snapshot.
 *
 * La pre-clasificación (resolveBrand + resolveType, lo caro en Levenshtein) se
 * hace ACÁ UNA VEZ por ciclo de TTL. Después el bot solo filtra por ids.
 */
export const loadSnapshot = async (): Promise<CatalogSnapshot> => {
  const orgId = await resolveOrgId();
  if (!orgId) {
    throw new Error(
      "No se pudo resolver la org de KAPSO_ORG_SLUG — no hay snapshot de catálogo.",
    );
  }

  // Todo con basePrisma y where explícito por org (ver cabecera multi-tenant).
  const [categories, brands, types, cells] = await Promise.all([
    basePrisma.category.findMany({
      where: { organizationId: orgId },
      select: { id: true, name: true, parentId: true },
    }),
    basePrisma.priceKgBrand.findMany({
      where: { organizationId: orgId },
      select: { id: true, name: true, keywords: true, species: true },
    }),
    basePrisma.priceKgType.findMany({
      where: { organizationId: orgId },
      select: { id: true, name: true, synonyms: true, species: true, sortOrder: true },
    }),
    basePrisma.priceKgPrice.findMany({
      where: { organizationId: orgId },
      select: { id: true, brandId: true, typeId: true, species: true, priceKg: true },
    }),
  ]);

  const secoCategoryIds = secoCategoryIdsForBot(categories);
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  // Formas mínimas que consume classifyProduct (solo los campos que usa).
  const brandLike = brands.map((b) => ({ id: b.id, name: b.name, keywords: b.keywords }));
  const typeLike = types.map((t) => ({ id: t.id, name: t.name, synonyms: t.synonyms }));

  const productRows = await basePrisma.product.findMany({
    // Solo los "carried" (los que realmente se venden): no tiene sentido
    // precargar los miles de productos no vendibles (3.705 en el benchmark)
    // ni clasificarlos.
    where: { organizationId: orgId, categoryId: { in: secoCategoryIds }, carried: true },
    select: { id: true, name: true, price: true, priceKgSuelto: true, categoryId: true },
  });

  const products: SnapshotProduct[] = [];
  for (const p of productRows) {
    // ESTE es el paso caro (Levenshtein marca×tipo) que antes corría en cada
    // mensaje. Acá corre una sola vez por la org.
    const ctx = classifyProduct(p, brandLike, typeLike, categoryById);
    const key = speciesKeyForEnum(ctx.species);
    if (!key) {
      console.warn(`[whatsappCatalogCache] producto sin especie clara, se omite: ${p.name}`);
      continue;
    }
    products.push({
      id: p.id,
      name: p.name,
      price: p.price,
      priceKgSuelto: p.priceKgSuelto ?? null,
      categoryId: p.categoryId ?? null,
      species: key,
      brandId: ctx.brand.brand?.id ?? null,
      typeId: ctx.type.type?.id ?? null,
    });
  }

  return {
    categories,
    brands: brands.map((b) => ({
      id: b.id,
      name: b.name,
      keywords: b.keywords,
      species: speciesKeysForEnum(b.species),
    })),
    stages: types.map((t) => ({
      id: t.id,
      name: t.name,
      synonyms: t.synonyms,
      species: speciesKeysForEnum(t.species),
      sortOrder: t.sortOrder,
    })),
    // Celda de planilla: species siempre PERRO/GATO (nunca AMBOS).
    cells: cells.map((c) => ({
      id: c.id,
      brandId: c.brandId,
      typeId: c.typeId,
      species: speciesKeyForEnum(c.species) ?? "perro",
      priceKg: c.priceKg,
    })),
    products,
    secoCategoryIds,
  };
};

// ---------------------------------------------------------------------------
// Cache con TTL (level module, una instancia por proceso)
// ---------------------------------------------------------------------------

let cache: CatalogSnapshot | null = null;
let lastLoad = 0;

/** TTL del snapshot (default 5 min), leído EN DINÁMICO en cada get para tests. */
const readTtl = (): number => {
  const raw = Number(process.env.KAPSO_CATALOG_TTL_MS ?? 5 * 60_000);
  return Number.isFinite(raw) && raw > 0 ? raw : 5 * 60_000;
};

/** TTL fijo capturado al carga del módulo (lo usa el scheduler del server). */
export const TTL_MS = readTtl();

/**
 * Devuelve el snapshot, cargándolo si no existe o si el TTL expiró.
 * - Primera carga (o post-invalidación): si falla, se propaga el error (no hay
 *   snapshot previo que servir).
 * - TTL expirado con snapshot previo: recarga, pero si la recarga falla se
 *   reutiliza el snapshot VIEJO → el bot nunca se queda sin catálogo, solo
 *   responde con datos de hasta TTL atrás (honesto: no inventa, usa el último
 *   precio conocido).
 */
export const getCatalogSnapshot = async (): Promise<CatalogSnapshot> => {
  const now = Date.now();
  const ttl = readTtl();
  if (cache && now - lastLoad < ttl) return cache;

  if (!cache) {
    const fresh = await loadSnapshot();
    cache = fresh;
    lastLoad = now;
    return fresh;
  }

  // TTL expirado: intento de recarga con fallback al snapshot previo.
  try {
    const fresh = await loadSnapshot();
    cache = fresh;
    lastLoad = now;
    return fresh;
  } catch (err) {
    console.error("[whatsappCatalogCache] recarga del catálogo falló, snapshot previo", err);
    return cache;
  }
};

/** Invalida el cache: el próximo getCatalogSnapshot recarga en frío. */
export const invalidateCatalogCache = (): void => {
  cache = null;
  lastLoad = 0;
};

/**
 * Fuerza una recarga inmediata (invalida y recarga). Útil para llamar a mano
 * tras cambios de precios o como respaldo del job de TTL.
 */
export const refreshCatalogCache = async (): Promise<CatalogSnapshot> => {
  invalidateCatalogCache();
  return getCatalogSnapshot();
};

// ---------------------------------------------------------------------------
// Lecturas del snapshot (SIN DB — solo filtran la estructura pre-cargada)
// ---------------------------------------------------------------------------

/** Especies disponibles para el bot, derivadas de etapas y marcas del snapshot. */
export const getSpecies = async (): Promise<SpeciesKey[]> => {
  const snap = await getCatalogSnapshot();
  const set = new Set<SpeciesKey>();
  for (const s of snap.stages) s.species.forEach((k) => set.add(k));
  for (const b of snap.brands) b.species.forEach((k) => set.add(k));
  return (["perro", "gato"] as SpeciesKey[]).filter((k) => set.has(k));
};

/** Etapas de una especie (ordenadas por sortOrder). [{ stage, id }]. */
export const getStages = async (
  species: SpeciesKey,
): Promise<{ stage: string; id: string }[]> => {
  const snap = await getCatalogSnapshot();
  return snap.stages
    .filter((s) => s.species.includes(species))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((s) => ({ stage: s.name, id: s.id }));
};

/** Marcas que tienen CELDAS para especie+etapa. [{ brand, id }]. */
export const getBrands = async (
  species: SpeciesKey,
  stageId: string | null | undefined,
): Promise<{ brand: string; id: string }[]> => {
  const snap = await getCatalogSnapshot();

  // Flujo con etapa: marcas con celda en esa etapa.
  if (stageId) {
    const brandIds = new Set<string>();
    for (const c of snap.cells) {
      if (c.typeId === stageId && c.species === species) brandIds.add(c.brandId);
    }
    const out = snap.brands
      .filter((b) => brandIds.has(b.id))
      .map((b) => ({ brand: b.name, id: b.id }))
      .sort((a, b) => a.brand.localeCompare(b.brand));
    return out;
  }

  // Flujo SIMPLIFICADO (sin etapa): marcas que tienen AL MENOS UN producto de
  // bolsa de esa especie en el snapshot — así elegir una marca siempre muestra
  // productos. Si no, «no tenemos datos cargados».
  const brandIds = new Set<string>();
  for (const p of snap.products) {
    if (p.species === species && p.brandId) brandIds.add(p.brandId);
  }
  return snap.brands
    .filter((b) => brandIds.has(b.id))
    .map((b) => ({ brand: b.name, id: b.id }))
    .sort((a, b) => a.brand.localeCompare(b.brand));
};

/** Bolsas pre-clasificadas que matchean especie+etapa+marca (solo filtrado). */
export const getProductsFor = async (
  species: SpeciesKey,
  brandId: string,
  stageId?: string | null,
): Promise<SnapshotProductSelection[]> => {
  const snap = await getCatalogSnapshot();
  return snap.products
    .filter(
      (p) =>
        p.species === species &&
        p.brandId === brandId &&
        // Si no hay etapa (flujo simplificado), listamos TODAS las bolsas de la
        // marca; si hay, filtramos por etapa.
        (stageId == null || p.typeId === stageId),
    )
    .map(
      (p): SnapshotProductSelection => ({
        type: "bolsa",
        id: p.id,
        label: p.name,
        price: p.price,
        priceKg: p.priceKgSuelto,
      }),
    )
    .sort((a, b) => a.label.localeCompare(b.label));
};

/** Celda de planilla (marca×tipo×especie), si existe. */
export const findCell = async (
  species: SpeciesKey,
  stageId: string,
  brandId: string,
): Promise<SnapshotCell | null> => {
  const snap = await getCatalogSnapshot();
  return (
    snap.cells.find(
      (c) => c.brandId === brandId && c.typeId === stageId && c.species === species,
    ) ?? null
  );
};

/** Celda de planilla por id (para resolveProductById de un "kilo"). */
export const findCellById = async (id: string): Promise<SnapshotCell | null> => {
  const snap = await getCatalogSnapshot();
  return snap.cells.find((c) => c.id === id) ?? null;
};

/** Producto (bolsa) por id, del snapshot. */
export const findProductById = async (id: string): Promise<SnapshotProduct | null> => {
  const snap = await getCatalogSnapshot();
  return snap.products.find((p) => p.id === id) ?? null;
};

/** Etiqueta legible de una celda: "MAXXIUM Adulto suelto" (marca + etapa). */
export const getCellLabel = async (brandId: string, typeId: string): Promise<string> => {
  const snap = await getCatalogSnapshot();
  const brand = snap.brands.find((b) => b.id === brandId);
  const type = snap.stages.find((s) => s.id === typeId);
  return `${brand?.name ?? ""} ${type?.name ?? ""} suelto`.trim();
};

export default {
  loadSnapshot,
  getCatalogSnapshot,
  invalidateCatalogCache,
  refreshCatalogCache,
  getSpecies,
  getStages,
  getBrands,
  getProductsFor,
  findCell,
  findCellById,
  findProductById,
  getCellLabel,
  TTL_MS,
};

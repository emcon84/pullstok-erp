// Módulo de consulta de catálogo para el bot de WhatsApp (FASE 4).
//
// Reemplaza la búsqueda de producto por TEXTO LIBRE de FASE 2/3 por una
// navegación guiada por la taxonomía: ESPECIE → ETAPA → MARCA → PRODUCTO. Cada
// paso resuelve las opciones desde la DB y devuelve el precio REAL.
//
// Fuente autoritativa de precios (decisión del usuario):
// - Bolsa cerrada → Product.price (precio unitario de la bolsa).
// - Por kilo / por monto → la CELDA de planilla PriceKgPrice.priceKg (no
//   Product.priceKgSuelto, que es derivado y puede no coincidir con la planilla).
//
// CACHE DE CATÁLOGO (whatsappCatalogCache): desde la FASE 4 estos helpers se
// consolidaron dos veces: (1) queries a DB por cada mensaje y (2) re-clasificación
// con fuzzy matching (Levenshtein marca×tipo) de cientos de productos POR mensaje.
// Ahora toda la estructura se carga UNA vez en un snapshot con TTL y se
// PRECLASIFICA al cargar (ver whatsappCatalogCache.ts). Acá todas las lecturas
// pasan por el snapshot: las funciones SOLO FILTRAN por los ids ya resueltos,
// sin Levenshtein por interacción. Única excepción mínima y honesta: el STOCK
// (quantity bolsería / kg suelto) sí cambia y se consulta puntual en
// resolveProductById (una query chica, no es lo que hacía lento al flujo).
//
// Multi-tenant: las queries de stock (looseStock/quantity) corren DENTRO de
// runWithTenant (el webhook de Kapso lo abre en handleIncomingMessage), así que
// usan el `prisma` scopeado (extensión anti-fuga que inyecta organizationId
// automáticamente). El snapshot en sí se carga vía basePrisma con where explícito
// por la org de KAPSO_ORG_SLUG (ver cabecera del cache).
//
// Regla férrea: NO se inventan precios. Si una celda/producto no tiene precio
// cargado, se devuelve "no tenemos precio" en vez de calcular algo. Todos los
// cálculos de costo pasan por round2 (api/src/utils/money.ts).

import { prisma } from "../config/db";
import { round2 } from "../utils/money";
import { normalizeName } from "./priceMatchingService";
import {
  getCatalogSnapshot,
  getSpecies,
  getStages,
  getBrands,
  getProductsFor,
  findCell,
  findCellById,
  findProductById,
  getCellLabel,
  type SpeciesKey,
  type SnapshotProduct,
} from "./whatsappCatalogCache";

// ---------------------------------------------------------------------------
// Helpers de dominio (internos)
// ---------------------------------------------------------------------------

/** Etiqueta humana de una especie ("perro" → "Perro"), para el texto del bot. */
export const SPECIES_LABELS: Record<string, string> = {
  perro: "Perro",
  gato: "Gato",
};

/**
 * Normaliza la respuesta del cliente a la clave de especie ("perro"/"gato").
 * Acepta la palabra (con o sin tilde), el id de botón, o el número (1=perro,
 * 2=gato). No reconocido → null.
 */
export const normalizeSpeciesAnswer = (answer: string): string | null => {
  const a = normalizeName(answer);
  const has = (kw: string) => a.includes(kw);
  if (a === "perro" || a === "1" || has("perro")) return "perro";
  if (a === "gato" || a === "2" || has("gato")) return "gato";
  return null;
};

/** Convierte la clave de especie del bot a SpeciesKey (default perro). */
const toSpeciesKey = (species: string): SpeciesKey =>
  species === "gato" ? "gato" : "perro";

/** Parsea un Float seguro desde la respuesta del cliente (kg / importe). */
export const parseDecimal = (answer: string): number | null => {
  const num = parseFloat(
    (answer ?? "").replace(",", ".").replace(/[^\d.]/g, ""),
  );
  return Number.isFinite(num) && num > 0 ? num : null;
};

/** Formatea un monto sin separador de miles (45000 → "45000", 45000.5 → "45000.5"). */
export const formatMoney = (n: number): string => {
  const r = round2(n);
  if (Number.isInteger(r)) return String(r);
  return r.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
};

/** Formatea una cantidad (kg / unidades) sin ceros al final (2 → "2", 1.5 → "1.5"). */
export const formatQty = (n: number): string => {
  const r = round2(n);
  if (Number.isInteger(r)) return String(r);
  return r.toFixed(2).replace(/\.?0+$/, "");
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Especies disponibles para el bot (perro/gato), derivadas de las especies
 * declaradas en el snapshot (etapas + marcas). Devuelve las que tengan data.
 */
export const listSpecies = async (): Promise<string[]> => getSpecies();

/**
 * Etapas de una especie (Adulto, Cachorro, Kitten, Senior...), desde el
 * snapshot, ordenadas por sortOrder. Devuelve [{ stage, id }].
 */
export const listStages = async (
  species: string,
): Promise<{ stage: string; id: string }[]> => getStages(toSpeciesKey(species));

/**
 * Matchea el texto libre que escribe el cliente contra las ETAPAS (PriceKgType)
 * de la especie. Como las etapas son pocas (8) y tienen sinónimos (Kitten→Gatito,
 * ADULT→Adulto), se resuelve por nombre normalizado, sinónimo o substring,
 * leído del snapshot (sin DB). Devuelve hasta 3 candidatas; si hay exactamente
 * UNA con `exact`, el flujo avanza.
 */
export const matchStages = async (
  species: string,
  query: string,
): Promise<{ stage: string; id: string; exact: boolean }[]> => {
  const q = normalizeName(query);
  if (!q) return [];

  const snap = await getCatalogSnapshot();
  const stages = snap.stages
    .filter((s) => s.species.includes(toSpeciesKey(species)))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  const scored = stages
    .map((t) => {
      const nameNorm = normalizeName(t.name);
      const synonyms = (t.synonyms ?? []).map(normalizeName).filter(Boolean);
      // Exacto: el texto es el nombre o un sinónimo.
      if (nameNorm === q || synonyms.includes(q)) {
        return { id: t.id, stage: t.name, score: 100, exact: true };
      }
      // Substring: el texto está contenido en el nombre o en un sinónimo.
      if (nameNorm.includes(q) || synonyms.some((s) => s.includes(q))) {
        return { id: t.id, stage: t.name, score: 50, exact: false };
      }
      return { id: t.id, stage: t.name, score: 0, exact: false };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.stage.localeCompare(b.stage));

  const uniqueIds = new Set(scored.map((s) => s.id));
  if (scored.length === 1 && uniqueIds.size === 1) {
    return [{ stage: scored[0].stage, id: scored[0].id, exact: true }];
  }
  return scored.slice(0, 3).map((s) => ({ stage: s.stage, id: s.id, exact: false }));
};

/**
 * Marcas que tienen CELDAS de planilla para la especie+etapa dada (PriceKgBrand
 * join PriceKgPrice), leídas del snapshot. Devuelve [{ brand, id }].
 * FASE 6: `species` puede venir null (la marca se elige ANTES que la especie) →
 * devuelve las marcas de todas las especies.
 */
export const listBrands = async (
  species: string | null | undefined,
  stageId: string | null | undefined,
): Promise<{ brand: string; id: string }[]> => {
  return getBrands(species ? toSpeciesKey(species) : null, stageId ?? null);
};

/**
 * Matchea el texto libre que escribe el cliente contra las marcas del catálogo.
 *
 * Con más de 3 opciones (límite de WhatsApp) NO se muestran botones ni lista
 * numerada: el cliente ESCRIBE la marca. Esta función resuelve ese texto:
 * - Usa el mismo motor de normalización/keywords del matching planilla↔productos
 *   (resolveBrand), así "proplan" → ProPlan, "old prince" → Old Prince. Los
 *   keywords se lean del snapshot (ya cargados al precachear) → sin DB.
 * - Devuelve las marcas que coinciden. Si hay exactamente UNA (el cliente la
 *   definió bien), la fila lleva `exact: true` → el flujo avanza directo.
 * - Si hay varias cercanas (ej. "agility" → AGILITY y AGILITY CORDERO), devuelve
 *   hasta 3 con `exact: false` para que el cliente confirme con un número.
 * - Si no hay ninguna, devuelve [] → el bot pide que la escriba de nuevo.
 */
export const matchBrands = async (
  species: string | null | undefined,
  query: string,
): Promise<{ brand: string; id: string; exact: boolean }[]> => {
  const q = normalizeName(query);
  if (!q) return [];

  // Buscamos en TODAS las marcas de la especie (sin filtrar por etapa): el cliente
  // puede pedir una marca de cualquier etapa. Antes se filtraba por stageId y por
  // eso "Old Prince" no aparecía si no estaba en la etapa elegida.
  // FASE 6: si `species` es null (la marca va antes que la especie), buscamos en
  // las marcas de TODAS las especies.
  const snap = await getCatalogSnapshot();
  const brands = snap.brands.filter((b) =>
    !species || b.species.includes(toSpeciesKey(species)),
  );

  const scored = brands
    .map((b) => {
      const keywords = b.keywords ?? [];
      // Coincidencia exacta del nombre normalizado o de algún keyword.
      if (normalizeName(b.name) === q || keywords.some((k) => normalizeName(k) === q)) {
        return { brand: b.name, id: b.id, score: 100, exact: true };
      }
      // El texto es un substring del nombre de la marca o del keyword.
      const nameHit = normalizeName(b.name).includes(q);
      const kwHit = keywords.some((k) => normalizeName(k).includes(q));
      if (nameHit || kwHit) return { brand: b.name, id: b.id, score: 50, exact: false };
      return { brand: b.name, id: b.id, score: 0, exact: false };
    })
    .filter((b) => b.score > 0)
    .sort((a, b) => b.score - a.score || a.brand.localeCompare(b.brand));

  // Decisión de match: si el cliente escribió el nombre/keyword EXACTO de UNA sola
  // marca, la elegimos (aunque haya variantes que compartan substring — ej.
  // "excellent" → "Excellent", no "Excellent Premium"). Si hay varias exactas o
  // ninguna exacta, mostramos candidatas para confirmar.
  const exact = scored.filter((s) => s.score === 100);
  if (exact.length === 1) {
    return [{ brand: exact[0].brand, id: exact[0].id, exact: true }];
  }
  const uniqueIds = new Set(scored.map((s) => s.id));
  if (scored.length === 1 && uniqueIds.size === 1) {
    return [{ brand: scored[0].brand, id: scored[0].id, exact: true }];
  }
  // Varias candidatas (exacto + variantes, o varias parciales) → hasta 3 para
  // confirmar, sin `exact` (el flujo pide elegir una con número).
  return scored.slice(0, 3).map((s) => ({ brand: s.brand, id: s.id, exact: false }));
};

// Shape público de una opción de producto que muestra el bot (bolsa y/o kilo).
export interface ProductSelection {
  type: "bolsa" | "kilo";
  id: string;
  label: string;
  price: number;
  priceKg: number | null;
}

/**
 * Productos que coinciden con especie+etapa+marca, leídos del snapshot:
 * - la celda de kilo (PriceKgPrice) con su priceKg, si existe;
 * - las bolsas ya PRECLASIFICADAS al cargar el snapshot (su species/brandId/
 *   typeId se resolvieron UNA vez con classifyProduct al cargar) → acá solo se
 *   FILTRA, sin Levenshtein ni re-consulta por mensaje.
 */
export const listProductsForSelection = async (
  species: string,
  brandId: string,
  stageId?: string | null,
): Promise<ProductSelection[]> => {
  const key = toSpeciesKey(species);
  const result: ProductSelection[] = [];

  // ── Celda de kilo: es la fuente autoritativa del precio suelto. Como el flujo
  // simplificado ya no pide etapa, buscamos la primera celda de la marca+especie.
  const snap = await getCatalogSnapshot();
  const cell = stageId
    ? await findCell(key, stageId, brandId)
    : (snap.cells.find((c) => c.brandId === brandId && c.species === key) ?? null);
  if (cell && cell.priceKg > 0) {
    result.push({
      type: "kilo",
      id: cell.id,
      label: await getCellLabel(cell.brandId, cell.typeId),
      price: cell.priceKg,
      priceKg: cell.priceKg,
    });
  }

  // ── Bolsas: todas las de la marca (sin etapa, o filtradas por etapa) ──
  const bolsa = await getProductsFor(key, brandId, stageId ?? null);
  result.push(...bolsa);

  return result;
};

// ---------------------------------------------------------------------------
// Matcheo de producto por atributos (FASE 6: marca × especie × etapa × peso)
// ---------------------------------------------------------------------------

/** Resultado de un match de producto para confirmar con precio. */
export interface ProductMatch {
  id: string;
  type: "bolsa" | "kilo";
  name: string;
  price: number;
}

/** Extrae el peso numérico de un texto de tamaño ("15 kg" → 15, "7,5kg" → 7.5). */
const parseWeight = (sizeText: string | null | undefined): number | null => {
  const raw = (sizeText ?? "").replace(/,/g, ".").toLowerCase();
  const m = raw.match(/\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** ¿El nombre del producto contiene un peso aproximadamente igual al pedido?
 *  Compara los tokens numéricos del nombre contra el peso ("X15KG"→15, "X7,5KG"→7.5). */
const likeWeight = (label: string, weight: number): boolean => {
  const tokens =
    normalizeName(label).replace(/,/g, ".").match(/\d+(?:\.\d+)?/g) ?? [];
  return tokens.some((t) => Math.abs(parseFloat(t) - weight) < 0.01);
};

/** Convierte una opción de selección a un match (id + tipo + nombre + precio). */
const toProductMatch = (c: ProductSelection): ProductMatch => ({
  id: c.id,
  type: c.type,
  name: c.label,
  price: c.price,
});

/**
 * Matcheo de producto del flujo de captura estructurada (FASE 6): a partir de
 * los atributos que declaró el cliente (marca, especie, etapa y peso/tamaño)
 * busca un producto real en el catálogo para confirmarlo CON precio.
 *
 * - Bolsa: exige que el peso declarado matchee el nombre de la bolsa (o que haya
 *   una sola bolsa de la marca/etapa). Varias sin desambiguar → null (requerimiento).
 * - Kilo / monto: preferimos la celda suelta (kilo) si existe; si no, una única
 *   bolsa; si hay varias y no se puede desambiguar → null (requerimiento).
 *
 * Devuelve null cuando no se pudo resolver → el ítem queda como requerimiento y
 * un asesor lo arma en el ERP.
 */
export const matchProductForDraft = async (input: {
  species?: string | null;
  brandId?: string | null;
  stageId?: string | null;
  sizeText?: string | null;
  orderType?: string | null;
}): Promise<ProductMatch | null> => {
  const { species, brandId, stageId, sizeText, orderType } = input;
  if (!species || !brandId) return null;

  const candidates = await listProductsForSelection(species, brandId, stageId ?? null);
  if (candidates.length === 0) return null;

  const isBolsaOrder = orderType === "bolsa";
  const weight = parseWeight(sizeText);

  // Bolsa: el peso desambigua. Si el cliente declaró peso, exigimos un match en el
  // nombre; si no, y hay UNA sola bolsa para la marca/etapa, la usamos.
  if (isBolsaOrder) {
    const bolsas = candidates.filter((c) => c.type === "bolsa");
    if (weight != null) {
      const hit = bolsas.find((c) => likeWeight(c.label, weight));
      return hit ? toProductMatch(hit) : null;
    }
    return bolsas.length === 1 ? toProductMatch(bolsas[0]) : null;
  }

  // Kilo / monto: preferimos la celda suelta (la fuente autoritativa del precio).
  const kilo = candidates.find((c) => c.type === "kilo");
  if (kilo) return toProductMatch(kilo);
  return candidates.length === 1 ? toProductMatch(candidates[0]) : null;
};

/** Nombre de marca por id, del snapshot (para pintar la línea del pedido). */
export const brandNameById = async (
  id: string | null | undefined,
): Promise<string | null> => {
  if (!id) return null;
  const snap = await getCatalogSnapshot();
  return snap.brands.find((b) => b.id === id)?.name ?? null;
};

/** Nombre de etapa por id, del snapshot (para pintar la línea del pedido). */
export const stageNameById = async (
  id: string | null | undefined,
): Promise<string | null> => {
  if (!id) return null;
  const snap = await getCatalogSnapshot();
  return snap.stages.find((s) => s.id === id)?.name ?? null;
};

// Shape de un producto resuelto por id (precio real + stock).
export interface ResolvedProduct {
  type: "bolsa" | "kilo";
  name: string;
  price: number;
  priceKg: number | null;
  stock: number | null;
}

/** Stock suelto (kg) disponible de una celda, sumado entre sucursales. */
const looseStockForCell = async (cellId: string): Promise<number | null> => {
  const stocks = await prisma.looseStock.findMany({
    where: { priceKgPriceId: cellId },
    select: { quantity: true },
  });
  const total = stocks.reduce((acc, r) => acc + r.quantity, 0);
  return total > 0 ? round2(total) : null;
};

/**
 * Resuelve el precio REAL de un elemento seleccionado por id. El id puede ser
 * de un Product (bolsa) o de una celda PriceKgPrice (kilo) → se prueba el
 * producto primero y la celda después. El precio/nombre salen del snapshot;
 * el stock (quantity de bolsa / kg suelto) es la ÚNICA consulta a DB acá,
 * porque el stock SÍ cambia y no conviene cachearlo (una query chica puntual).
 * stock = units (bolsa) / kg (kilo).
 */
export const resolveProductById = async (
  id: string,
): Promise<ResolvedProduct | null> => {
  const product: SnapshotProduct | null = await findProductById(id);
  if (product) {
    const stockRow = await prisma.product.findFirst({
      where: { id },
      select: { quantity: true },
    });
    return {
      type: "bolsa",
      name: product.name,
      price: product.price,
      priceKg: product.priceKgSuelto,
      stock: stockRow?.quantity ?? null,
    };
  }

  const cell = await findCellById(id);
  if (cell) {
    return {
      type: "kilo",
      name: await getCellLabel(cell.brandId, cell.typeId),
      price: cell.priceKg,
      priceKg: cell.priceKg,
      stock: await looseStockForCell(cell.id),
    };
  }

  return null;
};

// Item de costo que el bot calcula al confirmar cantidad/importe.
export interface OrderCostItem {
  type: "bolsa" | "kilo" | "monto";
  id: string;
  // Cantidad: unidades (bolsa) o kg (suelto). NO aplica al tipo "monto".
  quantity?: number;
  amount?: number;
}

/**
 * Calcula el costo de un ítem del pedido con el precio REAL del snapshot:
 * - bolsa → round2(quantity × Product.price)
 * - kilo → round2(quantity × PriceKgPrice.priceKg)
 * - monto → el total es el monto (el kg, en todo caso, es derivado en otra capa)
 * `detail` es el texto legible que el bot muestra al cliente. Si no hay precio
 * cargado, lo dice HONESTAMENTE en vez de inventar un número.
 */
export const calculateOrderCost = async (
  item: OrderCostItem,
): Promise<{ total: number; detail: string }> => {
  if (item.type === "monto") {
    const total = round2(item.amount ?? 0);
    return { total, detail: `$${formatMoney(total)}` };
  }

  const resolved = await resolveProductById(item.id);
  if (!resolved) {
    return {
      total: 0,
      detail: "No encontramos ese producto en el catálogo. Debería estar cargado.",
    };
  }

  const price = item.type === "bolsa" ? resolved.price : resolved.priceKg;
  const qty = item.quantity ?? 0;
  if (price == null || price <= 0 || qty <= 0) {
    return { total: 0, detail: "Todavía no tenemos precio cargado para eso." };
  }

  const total = round2(qty * price);

  if (item.type === "bolsa") {
    const detail = `${formatQty(qty)} × ${resolved.name} @ $${formatMoney(price)} = $${formatMoney(total)}`;
    return { total, detail };
  }
  const detail = `${formatQty(qty)} kg @ $${formatMoney(price)}/kg = $${formatMoney(total)}`;
  return { total, detail };
};

// ---------------------------------------------------------------------------
// Asesoramiento Groq — datos REALES para el system prompt + tools
// ---------------------------------------------------------------------------

/**
 * Score simple para rankear productos frente a una query de texto libre:
 * valor exacto en el nombre, token presente, o distancia Levenshtein ≤ 2 sobre
 * la marca. Devuelve un número (más alto = más relevante) o -1 si no matchea.
 */
const scoreProduct = (productName: string, query: string): number => {
  const q = normalizeName(query);
  if (!q) return -1;
  const name = normalizeName(productName);
  if (name.includes(q)) return 30 + q.length;
  const tokens = q.split(" ").filter(Boolean);
  let tokensHit = 0;
  for (const t of tokens) {
    if (name.includes(t)) tokensHit++;
  }
  if (tokensHit > 0) return tokensHit * 10;
  return -1;
};

const categoryPath = (
  categoryById: Map<string, { id: string; name: string; parentId: string | null }>,
  categoryId: string | null,
): string => {
  if (!categoryId) return "";
  const cat = categoryById.get(categoryId);
  if (!cat) return "";
  const parent = cat.parentId ? categoryById.get(cat.parentId) : null;
  return parent ? `${parent.name} > ${cat.name}` : cat.name;
};

const brandLabel = (snap: Awaited<ReturnType<typeof getCatalogSnapshot>>, id: string | null): string =>
  id ? snap.brands.find((b) => b.id === id)?.name ?? "—" : "—";

const stageLabel = (snap: Awaited<ReturnType<typeof getCatalogSnapshot>>, id: string | null): string =>
  id ? snap.stages.find((s) => s.id === id)?.name ?? "—" : "—";

/**
 * Slug del catálogo (texto plano) que se vierte al system prompt de Groq para que
 * asesore con datos REALES sin inventar. Una línea por producto de bolsa (nombre,
 * categoría, marca, etapa, especie, precio bolsa + por kg). Se arma desde el
 * snapshot (productos ya pre-clasificados) → no re-clasifica ni re-consulta.
 * Capado por caracteres para no inflar el contexto.
 */
export const buildCatalogSlug = async (maxChars = 5000): Promise<string> => {
  const snap = await getCatalogSnapshot();
  const categoryById = new Map(snap.categories.map((c) => [c.id, c]));

  const rows = snap.products
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => ({
      name: p.name,
      category: categoryPath(categoryById, p.categoryId),
      brand: brandLabel(snap, p.brandId),
      stage: stageLabel(snap, p.typeId),
      species: p.species === "gato" ? "Gato" : "Perro",
      price: p.price,
      priceKg: p.priceKgSuelto,
    }));
  if (rows.length === 0) return "(El catálogo está vacío)";

  const lines = rows.slice(0, 60).map((r) => {
    const kg = r.priceKg != null ? `$${formatMoney(r.priceKg)}/kg` : "sin precio suelto";
    return `- ${r.name} | Categoría: ${r.category || "s/cat"} | Marca: ${r.brand} | Etapa: ${r.stage} | Especie: ${r.species} | Bolsa: $${formatMoney(r.price)} | Suelto: ${kg}`;
  });
  return lines.join("\n").slice(0, maxChars);
};

/**
 * Busca un producto real por texto libre (para la tool get_product_info). Devuelve
 * una línea con los datos reales del mejor match, o un texto honesto si no hay.
 * Lee del snapshot (productos ya pre-clasificados) → sin re-consultar.
 */
export const searchCatalog = async (query: string): Promise<string> => {
  const q = normalizeName(query);
  const snap = await getCatalogSnapshot();
  const categoryById = new Map(snap.categories.map((c) => [c.id, c]));

  let best: SnapshotProduct | null = null;
  let bestScore = -1;
  for (const p of snap.products) {
    const sc = scoreProduct(p.name, q);
    if (sc > bestScore) {
      bestScore = sc;
      best = p;
    }
  }
  if (!best) return "No encontramos productos que coincidan con tu consulta.";

  const kg =
    best.priceKgSuelto != null ? `$${formatMoney(best.priceKgSuelto)}/kg` : "sin precio suelto";
  return (
    `${best.name} | Categoría: ${categoryPath(categoryById, best.categoryId) || "s/cat"} | ` +
    `Marca: ${brandLabel(snap, best.brandId)} | Etapa: ${stageLabel(snap, best.typeId)} | ` +
    `Especie: ${best.species === "gato" ? "Gato" : "Perro"} | Bolsa: $${formatMoney(best.price)} | Suelto: ${kg}`
  );
};

/**
 * Precio real de un producto para la tool get_price. Acepta texto libre; suma
 * también la celda de kilo si el producto suelto está en la planilla.
 */
export const findPrice = async (query: string): Promise<string> => {
  const line = await searchCatalog(query);
  if (line.startsWith("No encontramos")) return line;
  const priceMatch = line.match(/Bolsa: \$([\d.]+)/);
  const kgMatch = line.match(/Suelto: \$([\d.]+)\/kg/);
  const parts: string[] = [];
  if (priceMatch) parts.push(`bolsa $${priceMatch[1]}`);
  if (kgMatch) parts.push(`kg $${kgMatch[1]}`);
  return parts.length > 0 ? `${line} — Precio: ${parts.join(" · ")}` : line;
};

export default {
  listSpecies,
  listStages,
  matchStages,
  listBrands,
  matchBrands,
  listProductsForSelection,
  resolveProductById,
  calculateOrderCost,
  buildCatalogSlug,
  searchCatalog,
  findPrice,
  normalizeSpeciesAnswer,
  parseDecimal,
  formatMoney,
  formatQty,
  matchProductForDraft,
  brandNameById,
  stageNameById,
};

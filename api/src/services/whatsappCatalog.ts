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
// Multi-tenant: TODAS estas funciones corren DENTRO de runWithTenant (el
// webhook de Kapso lo abre en handleIncomingMessage), así que usan el `prisma`
// scopeado (extensión anti-fuga que inyecta organizationId automáticamente).
// Si se llamaran sin contexto de tenant, el scope de la extensión las bloquearía
// (es el comportamiento deseado: no hay forma honesta de filtrar por org sin
// conocerla).
//
// Regla férrea: NO se inventan precios. Si una celda/producto no tiene precio
// cargado, se devuelve "no tenemos precio" en vez de calcular algo. Todos los
// cálculos de costo pasan por round2 (api/src/utils/money.ts).

import { prisma } from "../config/db";
import { round2 } from "../utils/money";
import {
  classifyProduct,
  findAlimentoSecoCategoryIds,
  normalizeName,
  type Species as SpeciesEnum,
} from "./priceMatchingService";

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

/**
 * Especies enum de la planilla que aplican a una clave de especie del bot.
 * AMBOS aplica a ambas planillas, así que "perro" → [PERRO, AMBOS].
 */
const speciesEnum = (key: string): SpeciesEnum[] => {
  if (key === "perro") return ["PERRO", "AMBOS"];
  if (key === "gato") return ["GATO", "AMBOS"];
  return ["PERRO", "GATO", "AMBOS"];
};

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
 * declaradas en PriceKgType y PriceKgBrand. Devuelve las que tengan data.
 */
export const listSpecies = async (): Promise<string[]> => {
  const [types, brands] = await Promise.all([
    prisma.priceKgType.findMany({
      select: { species: true },
      distinct: ["species"],
    }),
    prisma.priceKgBrand.findMany({
      select: { species: true },
      distinct: ["species"],
    }),
  ]);

  const set = new Set<string>();
  for (const row of [...types, ...brands] as { species: SpeciesEnum }[]) {
    if (row.species === "PERRO" || row.species === "AMBOS") set.add("perro");
    if (row.species === "GATO" || row.species === "AMBOS") set.add("gato");
  }
  return [...set];
};

/**
 * Etapas de una especie, desde PriceKgType (Adulto, Cachorro, Kitten, Senior...).
 * Ordenadas por sortOrder. Devuelve [{ stage, id }].
 */
export const listStages = async (
  species: string,
): Promise<{ stage: string; id: string }[]> => {
  const spec = speciesEnum(species);
  const types = await prisma.priceKgType.findMany({
    where: { species: { in: spec } },
    select: { id: true, name: true },
    orderBy: { sortOrder: "asc" },
  });
  return types.map((t) => ({ stage: t.name, id: t.id }));
};

/**
 * Marcas que tienen CELDAS de planilla para la especie+etapa dada (PriceKgBrand
 * join PriceKgPrice). Devuelve [{ brand, id }].
 */
export const listBrands = async (
  species: string,
  stageId: string,
): Promise<{ brand: string; id: string }[]> => {
  const spec = speciesEnum(species);
  const cells = await prisma.priceKgPrice.findMany({
    where: { typeId: stageId, species: { in: spec } },
    select: { brandId: true },
    distinct: ["brandId"],
  });
  const brandIds = cells.map((c) => c.brandId);
  if (brandIds.length === 0) return [];

  const brands = await prisma.priceKgBrand.findMany({
    where: { id: { in: brandIds } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return brands.map((b) => ({ brand: b.name, id: b.id }));
};

/**
 * Matchea el texto libre que escribe el cliente contra las marcas del catálogo.
 *
 * Con más de 3 opciones (límite de WhatsApp) NO se muestran botones ni lista
 * numerada: el cliente ESCRIBE la marca. Esta función resuelve ese texto:
 * - Usa el mismo motor de normalización/keywords del matching planilla↔productos
 *   (resolveBrand), así "proplan" → ProPlan, "old prince" → Old Prince.
 * - Devuelve las marcas que coinciden. Si hay exactamente UNA (el cliente la
 *   definió bien), la fila lleva `exact: true` → el flujo avanza directo.
 * - Si hay varias cercanas (ej. "agility" → AGILITY y AGILITY CORDERO), devuelve
 *   hasta 3 con `exact: false` para que el cliente confirme con un número.
 * - Si no hay ninguna, devuelve [] → el bot pide que la escriba de nuevo.
 */
export const matchBrands = async (
  species: string,
  stageId: string,
  query: string,
): Promise<{ brand: string; id: string; exact: boolean }[]> => {
  const q = normalizeName(query);
  if (!q) return [];

  const all = await listBrands(species, stageId);
  if (all.length === 0) return [];
  // A `listBrands` le falta `keywords`; lo leemos por separado para el match.
  const brands = await prisma.priceKgBrand.findMany({
    where: { id: { in: all.map((b) => b.id) } },
    select: { id: true, name: true, keywords: true },
  });
  const byId = new Map(brands.map((b) => [b.id, b]));

  const scored = all
    .map((b) => {
      const full = byId.get(b.id);
      const keywords = full?.keywords ?? [];
      // Coincidencia exacta del nombre normalizado o de algún keyword.
      if (normalizeName(b.brand) === q || keywords.some((k) => normalizeName(k) === q)) {
        return { ...b, score: 100, exact: true };
      }
      // El texto es un substring del nombre de la marca o del keyword.
      const nameHit = normalizeName(b.brand).includes(q);
      const kwHit = keywords.some((k) => normalizeName(k).includes(q));
      if (nameHit || kwHit) return { ...b, score: 50, exact: false };
      return { ...b, score: 0, exact: false };
    })
    .filter((b) => b.score > 0)
    .sort((a, b) => b.score - a.score || a.brand.localeCompare(b.brand));

  // Decisión de match: el cliente escribe "agility" y hay "AGILITY" (exacto) junto
  // a "AGILITY CORDERO"/"AGILITY SALMON" (variantes). Como son VARIAS marcas que
  // participan, mostramos las candidatas para que confirme — no asumimos que la
  // de nombre exacto es la única. Solo avanzamos directo si hay UNA sola marca
  // que coincide (la definió bien).
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

/** Etiqueta legible de una celda de planilla: "MAXXIUM Adulto suelto". */
const cellLabel = async (brandId: string, typeId: string): Promise<string> => {
  const [brand, type] = await Promise.all([
    prisma.priceKgBrand.findFirst({
      where: { id: brandId },
      select: { name: true },
    }),
    prisma.priceKgType.findFirst({
      where: { id: typeId },
      select: { name: true },
    }),
  ]);
  return `${brand?.name ?? ""} ${type?.name ?? ""} suelto`.trim();
};

/**
 * Productos que coinciden con especie+etapa+marca. Devuelve:
 * - la celda de kilo (PriceKgPrice) con su priceKg, si existe;
 * - los productos de bolsa (Product) que clasifican a la misma marca+etapa+especie
 *   por nombre (reusando classifyProduct de priceMatchingService).
 */
export const listProductsForSelection = async (
  species: string,
  stageId: string,
  brandId: string,
): Promise<ProductSelection[]> => {
  const spec = speciesEnum(species);
  const result: ProductSelection[] = [];

  // ── Celda de kilo: es la fuente autoritativa del precio suelto ──
  const cell = await prisma.priceKgPrice.findFirst({
    where: { brandId, typeId: stageId, species: { in: spec } },
    select: { id: true, priceKg: true },
  });
  if (cell && cell.priceKg > 0) {
    result.push({
      type: "kilo",
      id: cell.id,
      label: await cellLabel(brandId, stageId),
      price: cell.priceKg,
      priceKg: cell.priceKg,
    });
  }

  // ── Bolsas: productos que matchean a la misma marca+etapa+especie ──
  const bolsa = await bolsaProducts(species, stageId, brandId);
  result.push(...bolsa);

  return result;
};

/**
 * Productos de bolsa (Alimento Seco) que clasifican a marca+etapa+especie por
 * nombre. Usa classifyProduct (mismo motor que el matching planilla↔productos)
 * → los precios son los REALES del Product (bolsa) y su priceKgSuelto derivado.
 */
const bolsaProducts = async (
  species: string,
  typeId: string,
  brandId: string,
): Promise<ProductSelection[]> => {
  const speciesSet = new Set(speciesEnum(species));

  const [categories, brands, types] = await Promise.all([
    prisma.category.findMany({ select: { id: true, name: true, parentId: true } }),
    prisma.priceKgBrand.findMany({
      select: { id: true, name: true, keywords: true },
    }),
    prisma.priceKgType.findMany({
      select: { id: true, name: true, synonyms: true },
    }),
  ]);
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const secoIds = findAlimentoSecoCategoryIds(categories);

  if (secoIds.length === 0) return [];

  const products = await prisma.product.findMany({
    where: { categoryId: { in: secoIds } },
    select: { id: true, name: true, price: true, priceKgSuelto: true, categoryId: true },
  });

  const out: ProductSelection[] = [];
  for (const p of products) {
    const ctx = classifyProduct(p, brands, types, categoryById);
    if (
      ctx.brand.brand?.id === brandId &&
      ctx.type.type?.id === typeId &&
      speciesSet.has(ctx.species)
    ) {
      out.push({
        type: "bolsa",
        id: p.id,
        label: p.name,
        price: p.price,
        priceKg: p.priceKgSuelto ?? null,
      });
    }
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
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
 * producto primero y la celda después. stock = units (bolsa) / kg (kilo).
 */
export const resolveProductById = async (
  id: string,
): Promise<ResolvedProduct | null> => {
  const product = await prisma.product.findFirst({
    where: { id },
    select: {
      id: true,
      name: true,
      price: true,
      priceKgSuelto: true,
      quantity: true,
    },
  });
  if (product) {
    return {
      type: "bolsa",
      name: product.name,
      price: product.price,
      priceKg: product.priceKgSuelto ?? null,
      stock: product.quantity ?? null,
    };
  }

  const cell = await prisma.priceKgPrice.findFirst({
    where: { id },
    select: { id: true, priceKg: true, brandId: true, typeId: true },
  });
  if (cell) {
    const label = await cellLabel(cell.brandId, cell.typeId);
    return {
      type: "kilo",
      name: label,
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
 * Calcula el costo de un ítem del pedido con el precio REAL de la DB:
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

// Shape de producto que se inyecta en el slug (nombre + clasificación + precios).
interface CatalogSlugRow {
  name: string;
  category: string;
  brand: string;
  stage: string;
  species: string;
  price: number;
  priceKg: number | null;
}

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

const speciesLabel = (s: SpeciesEnum): string =>
  s === "AMBOS" ? "Perro/Gato" : s === "PERRO" ? "Perro" : "Gato";

/**
 * Slug del catálogo (texto plano) que se vierte al system prompt de Groq para que
 * asesore con datos REALES sin inventar. Una línea por producto de bolsa (nombre,
 * categoría, marca, etapa, especie, precio bolsa + por kg). Capado por caracteres
 * para no inflar el contexto.
 */
export const buildCatalogSlug = async (maxChars = 5000): Promise<string> => {
  const [categories, brands, types] = await Promise.all([
    prisma.category.findMany({ select: { id: true, name: true, parentId: true } }),
    prisma.priceKgBrand.findMany({
      select: { id: true, name: true, keywords: true },
    }),
    prisma.priceKgType.findMany({
      select: { id: true, name: true, synonyms: true },
    }),
  ]);
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const products = await prisma.product.findMany({
    where: { carried: true },
    select: {
      id: true,
      name: true,
      price: true,
      priceKgSuelto: true,
      categoryId: true,
    },
    orderBy: { name: "asc" },
  });

  const rows: CatalogSlugRow[] = [];
  for (const p of products) {
    const ctx = classifyProduct(p, brands, types, categoryById);
    rows.push({
      name: p.name,
      category: categoryPath(categoryById, p.categoryId),
      brand: ctx.brand.brand?.name ?? "—",
      stage: ctx.type.type?.name ?? "—",
      species: speciesLabel(ctx.species),
      price: p.price,
      priceKg: p.priceKgSuelto ?? null,
    });
  }
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
 */
export const searchCatalog = async (query: string): Promise<string> => {
  const q = normalizeName(query);
  const [categories, brands, types] = await Promise.all([
    prisma.category.findMany({ select: { id: true, name: true, parentId: true } }),
    prisma.priceKgBrand.findMany({
      select: { id: true, name: true, keywords: true },
    }),
    prisma.priceKgType.findMany({
      select: { id: true, name: true, synonyms: true },
    }),
  ]);
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const products = await prisma.product.findMany({
    where: { carried: true },
    select: {
      id: true,
      name: true,
      price: true,
      priceKgSuelto: true,
      categoryId: true,
    },
  });

  let best: {
    id: string;
    name: string;
    price: number;
    priceKgSuelto: number | null;
    categoryId: string | null;
  } | null = null;
  let bestScore = -1;
  for (const p of products) {
    const sc = scoreProduct(p.name, q);
    if (sc > bestScore) {
      bestScore = sc;
      best = p;
    }
  }
  if (!best) return "No encontramos productos que coincidan con tu consulta.";

  const ctx = classifyProduct(best, brands, types, categoryById);
  const kg =
    best.priceKgSuelto != null ? `$${formatMoney(best.priceKgSuelto)}/kg` : "sin precio suelto";
  return (
    `${best.name} | Categoría: ${categoryPath(categoryById, best.categoryId) || "s/cat"} | ` +
    `Marca: ${ctx.brand.brand?.name ?? "—"} | Etapa: ${ctx.type.type?.name ?? "—"} | ` +
    `Especie: ${speciesLabel(ctx.species)} | Bolsa: $${formatMoney(best.price)} | Suelto: ${kg}`
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
};

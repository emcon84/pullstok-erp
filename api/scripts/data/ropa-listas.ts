// Dataset: pet clothing transcribed by hand from the 3 photographed price
// lists in Downloads/ropa (2026-09-29). Pure data + helpers, no DB access, so
// it can be unit-tested and reviewed before anything is written to prod.
//
// One row of a list = one product (each size has its own price). The org's
// "Talle" variant (CHICO/MEDIANO/GRANDE/EXTRA GRANDE) does not fit these
// numeric, per-supplier size scales, so the size goes in the product NAME
// instead, same convention as scripts/data/accesorios-listas.ts.
// Names are "<BASE> <SIZE> <BRAND>", uppercase, no accents where the sheets
// didn't have them (ROPA JAMIRO's "N" size codes are kept as printed).
// Categories are resolved by "PARENT > LEAF" against the org's existing tree.

export const CATEGORY_PATHS = {
  ROPA: "INDUMENTARIA Y SEGURIDAD > CAPAS, CHAQUETAS, BUZOS Y ABRIGOS",
  ACCESORIOS_INDUMENTARIA:
    "INDUMENTARIA Y SEGURIDAD > ACCESORIOS DE INDUMENTARIA (PAÑUELOS, BOTITAS)",
} as const;

export type CategoryPath = (typeof CATEGORY_PATHS)[keyof typeof CATEGORY_PATHS];

export interface Group {
  category: CategoryPath;
  brand: string | null;
  base: string;
  rows: ReadonlyArray<readonly [size: string, price: number]>;
}

export interface CatalogItem {
  category: CategoryPath;
  brand: string | null;
  name: string;
  price: number;
}

export function expandGroups(groups: readonly Group[]): CatalogItem[] {
  return groups.flatMap((g) =>
    g.rows.map(([size, price]) => ({
      category: g.category,
      brand: g.brand,
      name: [g.base, size, g.brand].filter(Boolean).join(" "),
      price,
    })),
  );
}

export function validateCatalog(items: readonly CatalogItem[]): string[] {
  const problems: string[] = [];
  const known = new Set<string>(Object.values(CATEGORY_PATHS));
  const seen = new Set<string>();
  for (const item of items) {
    const key = item.name.toUpperCase();
    if (!item.name.trim()) problems.push("empty name");
    if (seen.has(key)) problems.push(`duplicate name: ${item.name}`);
    seen.add(key);
    if (!Number.isInteger(item.price) || item.price <= 0) {
      problems.push(`invalid price for ${item.name}: ${item.price}`);
    }
    if (!known.has(item.category)) {
      problems.push(`unknown category for ${item.name}: ${item.category}`);
    }
  }
  return problems;
}

export interface LoadPlan {
  toCreate: Array<CatalogItem & { categoryId: string }>;
  existing: CatalogItem[];
  missingCategories: string[];
}

// Decides what a run would write: items whose category exists in the org and
// whose name is not already taken (case-insensitive). Never plans an update
// or a delete.
export function planLoad(
  items: readonly CatalogItem[],
  categoryIds: ReadonlyMap<string, string>,
  existingNames: ReadonlySet<string>,
): LoadPlan {
  const taken = new Set([...existingNames].map((n) => n.toUpperCase()));
  const plan: LoadPlan = { toCreate: [], existing: [], missingCategories: [] };
  for (const item of items) {
    const categoryId = categoryIds.get(item.category);
    if (!categoryId) {
      if (!plan.missingCategories.includes(item.category)) {
        plan.missingCategories.push(item.category);
      }
      continue;
    }
    if (taken.has(item.name.toUpperCase())) {
      plan.existing.push(item);
      continue;
    }
    plan.toCreate.push({ ...item, categoryId });
  }
  return plan;
}

export interface StockCandidate {
  id: string;
  name: string;
  quantity: number;
  rows: Array<{ branchId: string; quantity: number }>;
}

export interface StockPlan {
  toSet: Array<{ id: string; name: string; hasHqRow: boolean }>;
  skipped: Array<{ id: string; name: string; reason: string }>;
}

// Decides which freshly loaded catalog products get their initial stock.
// Anything that already carries stock (legacy quantity or any branch row != 0)
// is skipped, so a real count is never overwritten.
export function planStock(
  candidates: readonly StockCandidate[],
  catalogNames: ReadonlySet<string>,
  hqBranchId: string,
): StockPlan {
  const names = new Set([...catalogNames].map((n) => n.toUpperCase()));
  const plan: StockPlan = { toSet: [], skipped: [] };
  for (const c of candidates) {
    if (!names.has(c.name.toUpperCase())) continue;
    if (c.quantity !== 0 || c.rows.some((r) => r.quantity !== 0)) {
      plan.skipped.push({ id: c.id, name: c.name, reason: "already has stock" });
      continue;
    }
    plan.toSet.push({
      id: c.id,
      name: c.name,
      hasHqRow: c.rows.some((r) => r.branchId === hqBranchId),
    });
  }
  return plan;
}

// Pairs labels with prices; throws at load time if a transcription typo made
// the two lists different lengths.
const zip = (labels: string[], prices: number[]): Array<readonly [string, number]> => {
  if (labels.length !== prices.length) {
    throw new Error(`labels/prices length mismatch: ${labels.join(",")}`);
  }
  return labels.map((l, i) => [l, prices[i]] as const);
};
// Builds rows from a parallel list of numeric sizes (not necessarily
// sequential — the sheets skip and jump, e.g. 20,25,30...,100).
const talleRow = (talles: number[], prices: number[]) =>
  zip(talles.map((t) => `TALLE ${t}`), prices);

const LYM = "LECHE Y MIEL";
const BUEN_ABRIGO = "BUEN ABRIGO";
const JAMIRO = "JAMIRO";
const LAS_CHIQUIS = "LAS CHIQUIS";
const C = CATEGORY_PATHS;

export const GROUPS: readonly Group[] = [
  // ── Foto 1: hoja sin marca ───────────────────────────────────────────────
  {
    category: C.ROPA,
    brand: null,
    base: "POLERA",
    rows: talleRow(
      [20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100],
      [7000, 7500, 7800, 8000, 8300, 8800, 9500, 10500, 11500, 12000, 15500, 16800, 18800, 19500, 21000, 23000, 24000],
    ),
  },
  {
    category: C.ROPA,
    brand: null,
    base: "BUZO POLAR",
    rows: talleRow(
      [20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75],
      [7750, 8000, 8500, 8800, 9350, 9600, 10000, 10850, 12000, 12900, 15350, 16750],
    ),
  },
  // VERIFY: could be a bed blanket rather than a garment — see VERIFY below.
  {
    category: C.ROPA,
    brand: null,
    base: "MANTA CON CORDERITO",
    rows: talleRow(
      [30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80],
      [3900, 5500, 5700, 6300, 9300, 9800, 10900, 11300, 12100, 15100, 19800],
    ),
  },
  {
    category: C.ROPA,
    brand: null,
    base: "BUZO FRISA",
    rows: talleRow(
      [20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75],
      [8350, 8600, 9100, 9400, 9900, 10800, 12200, 12900, 13600, 14200, 16900, 18600],
    ),
  },

  // ── Foto 2: LECHE Y MIEL ─────────────────────────────────────────────────
  // VERIFY: the sheet also has a cm measure per size; the size number was
  // used for the name, not the cm — see VERIFY below.
  {
    category: C.ROPA,
    brand: LYM,
    base: "POLAR LISO",
    rows: talleRow(
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      [3500, 3700, 4000, 4600, 5300, 6300, 7000, 9000, 9400, 10300, 12400, 12700, 13000],
    ),
  },
  {
    category: C.ROPA,
    brand: LYM,
    base: "POLAR SOFT",
    // size 0 has no price on the sheet, so it's omitted (starts at 1).
    rows: talleRow(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      [4700, 5200, 6000, 6800, 8000, 9000, 12000, 13000, 14300, 15000, 15500, 16000],
    ),
  },

  // ── Foto 2: ROPA JAMIRO — the sheet doesn't say what garment this is,
  // loaded under the generic base "ROPA" for the owner to rename by hand.
  {
    category: C.ROPA,
    brand: JAMIRO,
    base: "ROPA",
    rows: [
      ["TALLE N25", 3400],
      ["TALLE N30", 4000],
      ["TALLE N35", 4500],
      ["TALLE N40", 5300],
      ["TALLE N45", 6200],
      ["TALLE N50", 7000],
      ["TALLE N55", 8000],
      ["TALLE N60", 9000],
      ["TALLE N65", 10000],
      ["TALLE N70", 11000],
      ["TALLE N75", 12000],
      ["TALLE N88 XXXL", 13000],
    ],
  },
  // ── Foto 2: LAS CHIQUIS — same problem, same generic-base treatment.
  {
    category: C.ROPA,
    brand: LAS_CHIQUIS,
    base: "ROPA",
    rows: [
      ["TALLE 30", 8000],
      ["TALLE 35", 8800],
      ["TALLE 40", 9500],
      ["TALLE 45", 10000],
      ["TALLE 50", 10500],
      ["TALLE 55", 11000],
      ["TALLE 60", 11500],
      ["TALLE 65", 12500],
      ["TALLE 70", 13000],
      ["TALLE 75", 14000],
    ],
  },

  // ── Foto 3: "Buen Abrigo" ────────────────────────────────────────────────
  {
    category: C.ROPA,
    brand: BUEN_ABRIGO,
    base: "VESTIDO",
    rows: talleRow([0, 1, 2, 3, 4, 5, 6, 7], [7500, 8300, 9000, 9500, 10500, 11300, 12000, 12800]),
  },
  // PENDING: talles 8/9/10 (manuscritos) no se cargan — ver PENDING abajo.
  {
    category: C.ROPA,
    brand: BUEN_ABRIGO,
    base: "JEANS Y POLAR",
    rows: talleRow([0, 1, 2, 3, 4, 5, 6, 7], [10500, 11300, 12000, 12800, 13500, 14300, 15000, 15800]),
  },
  {
    category: C.ROPA,
    brand: BUEN_ABRIGO,
    base: "CON CAPUCHA",
    rows: talleRow([0, 1, 2, 3, 4, 5, 6, 7], [9000, 9800, 10500, 11300, 12000, 12800, 13500, 14300]),
  },
  {
    category: C.ROPA,
    brand: BUEN_ABRIGO,
    base: "SIN CAPUCHA",
    rows: talleRow(
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      [6000, 6800, 7500, 8300, 9000, 9800, 10500, 11300, 12000, 12800, 13500],
    ),
  },

  // ── Foto 3: sueltos, sin talle ───────────────────────────────────────────
  { category: C.ACCESORIOS_INDUMENTARIA, brand: BUEN_ABRIGO, base: "MOÑO", rows: [["", 3800]] },
  { category: C.ACCESORIOS_INDUMENTARIA, brand: BUEN_ABRIGO, base: "BANDANA CHICA", rows: [["", 3000]] },
  { category: C.ACCESORIOS_INDUMENTARIA, brand: BUEN_ABRIGO, base: "BANDANA GRANDE", rows: [["", 4500]] },
];

export const CATALOG: CatalogItem[] = expandGroups(GROUPS);

// Cells that are NOT loaded: handwritten over the print, in a different price
// format than the rest of the sheet, or with no obvious price. Need the
// owner's call.
export const PENDING: ReadonlyArray<{ source: string; text: string; reason: string }> = [
  ["TALLE 8", "$17.500"],
  ["TALLE 9", "$17.500"],
  ["TALLE 10", "$17.500"],
].map(([talle, price]) => ({
  source: "Foto 3 (Buen Abrigo — Jeans y Polar)",
  text: `JEANS Y POLAR ${talle}: ${price} (manuscrito)`,
  reason:
    "precio manuscrito en formato distinto al resto de la lista ('$17.500' vs '$17,500' impreso) — verificar si es un precio real o un borrador",
}));

// Loaded as printed, but worth a second look before publishing to the store.
const VERIFY_NOTES: ReadonlyArray<{ prefix: string; note: string }> = [
  {
    prefix: "MANTA CON CORDERITO",
    note: "puede ser una manta de cama, no una prenda — verificar con el dueño",
  },
  {
    prefix: "POLAR LISO",
    note: "la foto también trae la medida en cm; se usó el número de talle, no el cm",
  },
  {
    prefix: "POLAR SOFT",
    note: "la foto también trae la medida en cm; se usó el número de talle, no el cm",
  },
];

export const VERIFY: ReadonlyArray<{ name: string; note: string }> = CATALOG.flatMap((item) => {
  const match = VERIFY_NOTES.find((v) => item.name.startsWith(v.prefix));
  return match ? [{ name: item.name, note: match.note }] : [];
});

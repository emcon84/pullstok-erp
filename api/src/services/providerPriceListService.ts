/**
 * Alican provider price-list parser and normalization (sdd/alican-wholesale-price-list).
 *
 * Pure functions: NO Prisma imports in this module (WU1 constraint). The
 * catalog-matching and persistence layers (WU3/WU4) live in the same file
 * below this pure section, matching the codebase pattern of exporting pure
 * helpers from a service/controller module (see productController.ts).
 *
 * The real pdf-parse output (v2.4.5) produces ONE LINE per product row:
 *   SECO: "SIEGER Puppy Mini x 1 Kg. $ 8.795 $ 10.642 $ 14.190"
 *   WET : "Sieger Puppy Salmon y Pollo WET x 100 gr. SIEGER 12 pouches x 100 gr $ 2.125,4 $ 2.571,7 $ 3.429,1"
 * Hierarchy lines (brand / LÍNEA / subline) and header/footer noise are on
 * their own lines. See api/tests/fixtures/pdfs/README.md for the fixture origin.
 */

import { round2 } from "../utils/money";

// ── Types ──────────────────────────────────────────────────────────────────

export type Layout = "SECO" | "WET";

export interface ParsedRow {
  nombre: string;
  marca: string | null;
  linea: string | null;
  sublinea: string | null;
  unidadEmpaque: string | null;
  precioSinIva: number | null;
  precioConIva: number | null;
}

export interface ParsedPriceList {
  period: string | null;
  rows: ParsedRow[];
}

export class LayoutNotSupportedError extends Error {
  constructor(message = "Formato de planilla no reconocido") {
    super(message);
    this.name = "LayoutNotSupportedError";
  }
}

// ── Shared helpers ─────────────────────────────────────────────────────────

/** Known Alican brands in the SECO hierarchy (from the real 08/2026 PDF). */
const BRANDS_ALICAN = new Set([
  "SIEGER",
  "SIEGER KATZE",
  "SIEGERVET",
  "MAXXIUM PERROS",
  "MAXXIUM CATS",
  "BENTONITA HOMEBRAND",
  "AGILITY",
  "7 VIDAS",
  "GOOSTER",
  "SULTAN",
]);

/**
 * Layout fingerprint (structural signals, never silent): the header + the
 * WET-only "UNIDAD DE EMPAQUE" column, or SECO price columns + hierarchy lines.
 * NOTE (deviation from design §3.2): the real PDF text does NOT contain the
 * word "SECO" and the column headers are split across lines ("PRECIOS SIN" /
 * "IVA"), so the fingerprint relies on the signals that actually appear.
 */
export function detectLayout(text: string): Layout {
  const hasHeader = /LISTA DE PRECIOS ALICAN/i.test(text);
  if (!hasHeader) throw new LayoutNotSupportedError();
  if (/UNIDAD DE EMPAQUE/i.test(text)) return "WET";
  if (/PRECIOS\s+SIN\s+IVA/i.test(text) && /LÍNEA\s+/i.test(text)) return "SECO";
  throw new LayoutNotSupportedError();
}

/** VIGENCIA dd/mm/aaaa → ISO "YYYY-MM-DD"; null when absent or unparseable. */
export function capturePeriod(text: string): string | null {
  const m = /VIGENCIA\s+(\d{2})\/(\d{2})\/(\d{4})/.exec(text);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * AR price normalization (spec REQ-3). Own algorithm — the existing
 * parsePrice() in scripts/load-distributor-pdfs.ts is buggy for integer
 * thousands ("8.795" → 8.795 instead of 8795) and must NOT be reused.
 */
export function normalizePrice(raw: string): number | null {
  const s = String(raw).trim().replace(/\$/g, "").replace(/[\s\u00A0]/g, "");
  if (!/^[0-9.,]+$/.test(s)) return null;
  // Duplicated/inconsistent adjacent separators ("1..2", "1,.5") → null.
  if (/[.,][.,]/.test(s)) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let normalized = s;
  if (lastComma > -1 && lastDot > -1) {
    // Both separators → the LAST one is the decimal separator, the other thousands.
    normalized = lastComma > lastDot
      ? s.replace(/\./g, "").replace(",", ".")
      : s.replace(/,/g, "");
  } else if (lastComma > -1) {
    // Single comma → decimal if 1-2 digits follow, thousands otherwise.
    normalized = /,\d{1,2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (lastDot > -1) {
    // Single dot → decimal if 1-2 digits follow, thousands otherwise.
    normalized = /\.\d{1,2}$/.test(s) ? s : s.replace(/\./g, "");
  }
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}

/**
 * Name normalization for EXACT post-normalization matching (spec REQ-4).
 * "SIEGER Puppy Mini x 1 Kg." ≡ "sieger puppy mini 1kg". Pack-format words
 * ("bolsa", "sobre", "lata", ...) and a standalone pack "x" before a quantity
 * are dropped so the same product with a different pack wording still matches
 * ("SIEGER Ultra Vita Plus - bolsa x 1,5 Kg." ≡ "SIEGER ULTRA VITA PLUS 1.5 KG").
 */
export function normalizeName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // diacritics
    .toLowerCase()
    .replace(/[×✕]/g, "x") // only the multiplication sign → "x"
    .replace(/(\d)[,.](\d)/g, "$1.$2") // comma-decimal quantities: "1,5" → "1.5"
    .replace(/\b(kilos?|kgs?|kilogramos?)\b/g, "kg")
    .replace(/\b(grs?|gramos?)\b/g, "g")
    .replace(/\b(litros?|lts?)\b/g, "l")
    .replace(/\b(unidades?|unids?)\b/g, "un")
    .replace(/(\d)\s+(kg|g|l|ml|un)\b/g, "$1$2") // "1 kg" → "1kg"
    .replace(/\b(?:bolsas?|sobres?|latas?|envases?|paquetes?|sachets?|tarros?|bidones?|presentaciones?)\b\s*x?(?!\w)\s*/g, " ") // pack words: "bolsa x 1,5" → "1.5"
    .replace(/\bx\s+(?=\d)/g, "") // standalone pack "x" before a quantity: "x 1.5" → "1.5"
    .replace(/[()[\]{}]/g, " ") // parentheses → space
    .replace(/[—-]/g, " ") // hyphens/dashes → space
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.+$/, ""); // trailing dots
}

/** Best-effort pack expression at the end of a product name ("x 1 Kg." → "1 Kg."). */
export function extractUnit(name: string): string | null {
  const m = /x\s+([\d.,]+\s*(?:kg|kgs?|g|gr|grs?|kilo|kilos?|l|lt|lts?|ml|un|unid|unids?|sobre|sobres|bolsa|bolsas|latas?)[\w\s.]*)$/i.exec(
    name.trim(),
  );
  return m ? m[1].trim() : null;
}

/**
 * Header/footer/page-marker lines that carry no product data. Note: a "-"
 * price placeholder is NOT noise here — it is consumed as a null price so
 * rows priced with dashes become error rows instead of misaligning prices.
 */
export function isNoiseLine(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (/^[|•·]/.test(t)) return true;
  if (/^(HOJA|VIGENCIA|PÁGINA|PAGINA)\b/i.test(t)) return true;
  if (/^--\s*\d+\s+of\s+\d+\s*--$/.test(t)) return true;
  if (/LA RED COMERCIAL/i.test(t)) return true;
  if (/LISTA DE PRECIOS/i.test(t)) return true;
  if (/MODALIDAD DE VENTA/i.test(t)) return true;
  if (/%/.test(t)) return true;
  if (/^PRECIOS\b/i.test(t)) return true;
  if (/^(SIN IVA|CON IVA)$/i.test(t)) return true;
  if (/^SUGERIDO/i.test(t) || /^PÚBLICO/i.test(t) || /^PUBLICO/i.test(t)) return true;
  if (/^(IVA|EMPAQUE|UNIDAD DE)\s*$/i.test(t)) return true;
  if (/^DESCRIPCIÓN|^DESCRIPCION/i.test(t)) return true;
  if (/^LÍNEA DE ALIMENTOS/i.test(t)) return true;
  return false;
}

function cleanLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !isNoiseLine(l));
}

// ── Suggested price (spec REQ-7, design precision note) ────────────────────

/**
 * suggestedPrice = round2(Con IVA × 1.3334). When Con IVA is missing but
 * SIN IVA exists → Con IVA = round2(SIN IVA × 1.21) first. null when nothing
 * is derivable (row stays in "error" state).
 *
 * Precision finding: round2(10642 × 1.3334) = 14190.04, NOT 14190 — the PDF
 * truncates to an integer. The formula wins; the plan prints our values.
 */
export function computeSuggestedPrice(
  conIva: number | null,
  sinIva: number | null,
): number | null {
  if (conIva !== null && conIva !== undefined) return round2(conIva * 1.3334);
  if (sinIva !== null && sinIva !== undefined) {
    return round2(round2(sinIva * 1.21) * 1.3334);
  }
  return null;
}

// ── Parsers ────────────────────────────────────────────────────────────────

/** One product row: "NAME $ SIN $ CON $ SUG" (SUG from the PDF is discarded). */
const SECO_ROW = /^(.*?)\s+\$?\s*([\d.,\s]+)\s+\$?\s*([\d.,\s]+)\s+\$?\s*([\d.,\s]+)\s*$/;

/** SECO layout: brand → LÍNEA → subline → product rows (state machine). */
export function parseAlicanSeco(text: string): ParsedPriceList {
  const lines = cleanLines(text);
  const rows: ParsedRow[] = [];
  let marca: string | null = null;
  let linea: string | null = null;
  let sublinea: string | null = null;

  for (const line of lines) {
    if (BRANDS_ALICAN.has(line)) {
      marca = line;
      linea = null;
      sublinea = null;
      continue;
    }
    const lineMatch = /^LÍNEA\s+(.+)$/i.exec(line);
    if (lineMatch) {
      linea = lineMatch[1].trim();
      sublinea = null;
      continue;
    }
    const row = SECO_ROW.exec(line);
    if (row) {
      rows.push({
        nombre: row[1].trim(),
        marca,
        linea,
        sublinea,
        unidadEmpaque: extractUnit(row[1].trim()),
        precioSinIva: normalizePrice(row[2]),
        precioConIva: normalizePrice(row[3]),
      });
      continue;
    }
    if (/^[A-ZÑ0-9][A-ZÑ0-9 &.()+'-]*$/.test(line) && /[A-ZÑ]/.test(line)) {
      // ALL-CAPS-ish line without prices → subline (e.g. "SIEGER PUPPY").
      sublinea = line;
      continue;
    }
    // Name without prices (e.g. "STARTER Kit" or a row priced with dashes) →
    // error row, never a batch failure. Trailing "-" placeholders are stripped
    // from the display name.
    rows.push({
      nombre: line.replace(/[\s-]+$/g, ""),
      marca,
      linea,
      sublinea,
      unidadEmpaque: null,
      precioSinIva: null,
      precioConIva: null,
    });
  }

  return { period: capturePeriod(text), rows };
}

/**
 * WET layout: flat rows "NAME BRAND UNIT $ SIN $ CON $ SUG". Flat per design
 * D9: brand/line/subline are null (the WET section is a single flat list); the
 * unit is extracted from the separate UNIDAD DE EMPAQUE column.
 */
const WET_ROW =
  /^(.*?)\s+(\d+\s*(?:pouches|latas)\s*x\s*[\d.,]+\s*(?:gr|kg))\s+\$\s*([\d.,]+)\s+\$\s*([\d.,]+)\s+\$\s*([\d.,]+)\s*$/i;

/** Known Alican WET brands (inline column in the flat WET rows). */
const WET_BRANDS = new Set([
  "SIEGER",
  "KATZE",
  "MAXXIUM",
  "AGILITY P.",
  "AGILITY G.",
  "7 VIDAS",
  "GOOSTER",
]);

/**
 * Strips the trailing WET brand token from the row prefix when it matches a
 * known WET brand (design D9: the brand is NOT persisted as hierarchy; it is
 * only removed so the product name stays clean).
 */
function wetRowName(prefix: string): string {
  for (const brand of WET_BRANDS) {
    if (prefix.endsWith(` ${brand}`)) {
      return prefix.slice(0, prefix.length - brand.length - 1).trim();
    }
  }
  return prefix.trim();
}

export function parseAlicanWet(text: string): ParsedPriceList {
  const lines = cleanLines(text);
  const rows: ParsedRow[] = [];

  for (const line of lines) {
    const row = WET_ROW.exec(line);
    if (row) {
      rows.push({
        nombre: wetRowName(row[1]),
        // D9: flat layout — the brand present in the text is NOT persisted as
        // hierarchy (the WET plan is a plain list).
        marca: null,
        linea: null,
        sublinea: null,
        unidadEmpaque: row[2].trim(),
        precioSinIva: normalizePrice(row[3]),
        precioConIva: normalizePrice(row[4]),
      });
      continue;
    }
    // Anomalous non-noise line without the unit+prices shape → error row.
    rows.push({
      nombre: line,
      marca: null,
      linea: null,
      sublinea: null,
      unidadEmpaque: null,
      precioSinIva: null,
      precioConIva: null,
    });
  }

  return { period: capturePeriod(text), rows };
}

// ── Matching (spec REQ-5/REQ-6, design §5) ─────────────────────────────────

export type MatchState = "matched" | "unmatched" | "multi-match" | "duplicado" | "error";

export interface MatchResult {
  estado: MatchState;
  productId?: string;
  productIds?: string[];
  matchName?: string | null;
}

export interface PreviewRow {
  position: number; // idTemporal para el apply (determinista entre preview y apply)
  nombre: string; // nombre ORIGINAL del PDF
  unidadEmpaque: string | null;
  marca: string | null;
  linea: string | null;
  sublinea: string | null;
  precioSinIva: number | null;
  precioConIva: number | null;
  sugerido: number | null; // round2(conIva × 1.3334); fallback 1.21; null si nada
  estado: MatchState;
  productId: string | null;
  productIds?: string[];
  matchName?: string | null; // nombre del producto en catálogo (UX)
}

/**
 * Índice del catálogo de UNA org, claveado por nombre/código normalizados →
 * ids (multi-match = duplicados del catálogo). DEVIATION del design §5: no se
 * indexa por marca (byBrand): con matcheo por igualdad EXACTA post-normalización
 * (decisión cerrada #5) una fila jamás equivale al nombre de una marca, e
 * indexar marcas generaría multi-match spam. El scope org se aplica en el
 * findMany (where.organizationId) → lo que no está en la org no matchea.
 */
export interface CatalogIndex {
  byName: Map<string, string[]>;
  byCode: Map<string, string[]>;
  names: Map<string, string>; // productId → nombre en catálogo (matchName UX)
}

type DbLike = {
  product: {
    findMany: (args: {
      where: { organizationId: string };
      select: {
        id: true;
        name: true;
        code: true;
        variantAssignments: {
          select: {
            option: { select: { value: true; variant: { select: { name: true } } } };
          };
        };
      };
    }) => Promise<
      {
        id: string;
        name: string;
        code: string | null;
        variantAssignments: {
          option: { value: string; variant: { name: string } };
        }[];
      }[]
    >;
  };
};

export async function buildCatalogIndex(
  db: DbLike,
  organizationId: string,
): Promise<CatalogIndex> {
  const products = await db.product.findMany({
    where: { organizationId },
    select: {
      id: true,
      name: true,
      code: true,
      variantAssignments: {
        select: {
          option: { select: { value: true, variant: { select: { name: true } } } },
        },
      },
    },
  });

  const byName = new Map<string, string[]>();
  const byCode = new Map<string, string[]>();
  const names = new Map<string, string>();
  const add = (map: Map<string, string[]>, key: string, id: string) => {
    if (!key) return;
    const arr = map.get(key);
    if (arr) arr.push(id);
    else map.set(key, [id]);
  };

  for (const p of products) {
    names.set(p.id, p.name);
    add(byName, normalizeName(p.name), p.id);
    if (p.code) add(byCode, normalizeName(p.code), p.id);
  }
  return { byName, byCode, names };
}

function resultFor(ids: string[], index: CatalogIndex): MatchResult {
  if (ids.length === 1) {
    return {
      estado: "matched",
      productId: ids[0],
      productIds: ids,
      matchName: index.names.get(ids[0]) ?? null,
    };
  }
  return {
    estado: "multi-match",
    productId: ids[0], // default = primer id
    productIds: ids,
    matchName: index.names.get(ids[0]) ?? null,
  };
}

/** Match por igualdad EXACTA post-normalización; fallback por código. */
export function matchByName(
  nombreNormalizado: string,
  index: CatalogIndex,
): MatchResult {
  const ids = index.byName.get(nombreNormalizado);
  if (ids && ids.length > 0) return resultFor(ids, index);
  const codeIds = index.byCode.get(nombreNormalizado);
  if (codeIds && codeIds.length > 0) return resultFor(codeIds, index);
  return { estado: "unmatched" };
}

/**
 * Convierte filas parseadas en filas de preview. Reglas (REQ-5/REQ-6):
 * - Sin precios → estado error (no importable hasta omitir/asignar).
 * - 1 id → matched; 0 → unmatched; 2+ → multi-match (default primer id).
 * - Mismo nombre normalizado en 2+ filas del PDF → TODAS quedan duplicado
 *   (el apply valida a lo sumo UNA importación por grupo).
 * - Prioridad: error > duplicado > multi-match > matched > unmatched.
 * - El nombre ORIGINAL del PDF se conserva siempre.
 */
export function matchRows(rows: ParsedRow[], index: CatalogIndex): PreviewRow[] {
  const previews: PreviewRow[] = rows.map((row, position) => {
    const isError = row.precioSinIva === null && row.precioConIva === null;
    const m = isError
      ? { estado: "error" as MatchState }
      : matchByName(normalizeName(row.nombre), index);
    return {
      position,
      nombre: row.nombre,
      unidadEmpaque: row.unidadEmpaque,
      marca: row.marca,
      linea: row.linea,
      sublinea: row.sublinea,
      precioSinIva: row.precioSinIva,
      precioConIva: row.precioConIva,
      sugerido: computeSuggestedPrice(row.precioConIva, row.precioSinIva),
      estado: m.estado,
      productId: m.productId ?? null,
      productIds: m.productIds,
      matchName: m.matchName ?? null,
    };
  });

  // Grupos de duplicados del PDF (por nombre normalizado).
  const counts = new Map<string, number>();
  for (const p of previews) {
    const key = normalizeName(p.nombre);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const p of previews) {
    if (p.estado === "error") continue; // error > duplicado
    const key = normalizeName(p.nombre);
    if ((counts.get(key) ?? 0) > 1) p.estado = "duplicado";
  }

  return previews;
}

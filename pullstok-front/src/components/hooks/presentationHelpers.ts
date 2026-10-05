/**
 * sdd/product-presentations — pure helpers mirroring api/src/utils/presentations.ts.
 * Stock is stored in BASE units (factor 1); these helpers split it into
 * per-presentation levels, convert level counts back to base units and
 * validate a presentation set with the same rules/codes as the server.
 */

/** Presentation as returned by the API in product list/scan/offline (active only). */
export interface PresentationLike {
  name: string;
  factor: number;
  /** Absent on API product lists (they only carry ACTIVE presentations). */
  isActive?: boolean;
}

export class PresentationError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "PresentationError";
  }
}

const activeByFactorDesc = <T extends PresentationLike>(list: T[]): T[] =>
  list.filter((p) => p.isActive !== false).sort((a, b) => b.factor - a.factor);

/** Greedy split of base stock per active presentation (factor desc). */
export const toStockLevels = (
  baseQty: number,
  presentations: PresentationLike[],
): { name: string; count: number }[] => {
  const active = activeByFactorDesc(presentations);
  let rest = Math.max(0, Math.floor(baseQty));
  const levels: { name: string; count: number }[] = [];
  for (const p of active) {
    const count = Math.floor(rest / p.factor);
    if (count > 0) levels.push({ name: p.name, count });
    rest -= count * p.factor;
  }
  if (levels.length === 0 && active.length > 0) {
    levels.push({ name: active[active.length - 1].name, count: 0 });
  }
  return levels;
};

/** e.g. "2 Caja · 3 Blister · 5 Unidad" (names kept as configured). */
export const formatStockLevels = (
  baseQty: number,
  presentations: PresentationLike[],
): string =>
  toStockLevels(baseQty, presentations)
    .map((l) => `${l.count} ${l.name}`)
    .join(" · ");

/** Counts per presentation name → total in base units. Garbage counts are 0. */
export const levelsToBaseUnits = (
  counts: Record<string, number>,
  presentations: PresentationLike[],
): number =>
  activeByFactorDesc(presentations).reduce((total, p) => {
    const n = counts[p.name];
    return total + (Number.isFinite(n) && n > 0 ? Math.floor(n) * p.factor : 0);
  }, 0);

/** One active factor-1 presentation, integer factors >= 1, unique names. */
export const validatePresentationSet = (
  list: Required<PresentationLike>[],
): void => {
  for (const p of list) {
    if (!Number.isInteger(p.factor) || p.factor < 1) {
      throw new PresentationError(
        "PRESENTATION_FACTOR_INVALID",
        `El factor de "${p.name}" debe ser un entero mayor o igual a 1`,
      );
    }
  }
  const seen = new Set<string>();
  for (const p of list) {
    const key = p.name.trim().toLowerCase();
    if (seen.has(key)) {
      throw new PresentationError(
        "PRESENTATION_NAME_DUPLICATE",
        `Nombre de presentación repetido: "${p.name.trim()}"`,
      );
    }
    seen.add(key);
  }
  const bases = list.filter((p) => p.isActive && p.factor === 1);
  if (bases.length !== 1) {
    throw new PresentationError(
      "PRESENTATION_BASE_REQUIRED",
      "Debe haber exactamente una presentación activa con factor 1 (unidad base)",
    );
  }
};

/** Wholesale sellers get wholesalePrice when set, otherwise the retail price. */
export const resolvePresentationPrice = (
  presentation: { price: number; wholesalePrice?: number | null },
  sellsWholesale: boolean,
): number =>
  sellsWholesale && presentation.wholesalePrice != null
    ? presentation.wholesalePrice
    : presentation.price;

const isPositiveInt = (s: string): boolean => /^\d+$/.test(s.trim()) && Number(s) >= 1;

/** Factors of the pharmacy quick setup, or null while the counts are invalid. */
export const quickSetupFactors = (
  blistersPerBox: string,
  pillsPerBlister: string,
): { box: number; blister: number; pill: 1 } | null => {
  if (!isPositiveInt(blistersPerBox) || !isPositiveInt(pillsPerBlister)) return null;
  const pills = Number(pillsPerBlister);
  return { box: Number(blistersPerBox) * pills, blister: pills, pill: 1 };
};

export interface QuickSetupInput {
  blistersPerBox: string;
  pillsPerBlister: string;
  /** Typed by the user: prices are never derived from the factors. */
  prices: { box: string; blister: string; pill: string };
}

export interface QuickSetupPresentation {
  name: string;
  sortOrder: number;
  factor: number;
  price: number;
  wholesalePrice: null;
  isActive: true;
}

/** Caja / Blister / Pastilla (base) set from blisters-per-box and pills-per-blister. */
export const buildQuickSetup = (input: QuickSetupInput): QuickSetupPresentation[] => {
  const factors = quickSetupFactors(input.blistersPerBox, input.pillsPerBlister);
  if (!factors) {
    throw new PresentationError(
      "PRESENTATION_FACTOR_INVALID",
      "Blisters por caja y pastillas por blister deben ser números enteros mayores o iguales a 1",
    );
  }
  const price = (raw: string): number => {
    const n = raw.trim() === "" ? Number.NaN : Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      throw new PresentationError(
        "PRESENTATION_PRICE_INVALID",
        "Cada presentación necesita un precio válido (0 o más)",
      );
    }
    return n;
  };
  const rows: [string, number, string][] = [
    ["Caja", factors.box, input.prices.box],
    ["Blister", factors.blister, input.prices.blister],
    ["Pastilla", factors.pill, input.prices.pill],
  ];
  return rows.map(([name, factor, raw], i) => ({
    name,
    sortOrder: i,
    factor,
    price: price(raw),
    wholesalePrice: null,
    isActive: true,
  }));
};

/** Legacy duplicate product "<name> (Blister)" (case-insensitive, trimmed) → its price. */
export const findLegacyBlisterPrice = (
  productName: string,
  catalog: { name?: string | null; price: number | string }[],
): { name: string; price: number } | null => {
  const wanted = `${productName.trim()} (Blister)`.toLowerCase();
  const match = catalog.find((p) => (p.name ?? "").trim().toLowerCase() === wanted);
  return match ? { name: (match.name as string).trim(), price: Number(match.price) } : null;
};

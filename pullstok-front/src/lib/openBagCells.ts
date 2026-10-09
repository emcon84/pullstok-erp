import type { PriceKgSpecies } from "@/services/priceKgTypes";
import { razasOf, speciesOfName } from "@/utils/planillaGroups";

/** A loose-stock cell (brand x type x species) with the data needed to match it. */
export interface LooseCell {
  id: string;
  brandName: string;
  brandKeywords: string[];
  typeName: string;
  typeSynonyms: string[];
  species: PriceKgSpecies;
  priceKg: number | null;
  /** Full human label, same text the select shows. */
  label: string;
}

export interface CellSuggestion {
  cells: LooseCell[];
  brandMatched: boolean;
}

const MAX_RUN = 4;

export const SPECIES_LABELS: Record<string, string> = {
  PERRO: "Perro",
  GATO: "Gato",
  AMBOS: "Perros y gatos",
};

const priceSuffix = (priceKg: number | null): string =>
  priceKg ? ` — $${priceKg.toLocaleString("es-AR")}/kg` : "";

/** Full select label: "Brand · Type · Species — $/kg". */
export const fullCellLabel = (c: Pick<LooseCell, "brandName" | "typeName" | "species" | "priceKg">): string =>
  `${c.brandName} · ${c.typeName} · ${SPECIES_LABELS[c.species] ?? c.species}${priceSuffix(c.priceKg)}`;

/** Compact pill label (brand is already known): "Type · Species — $/kg". */
export const compactCellLabel = (c: Pick<LooseCell, "typeName" | "species" | "priceKg">): string =>
  `${c.typeName} · ${SPECIES_LABELS[c.species] ?? c.species}${priceSuffix(c.priceKg)}`;

/** Lowercase, accent-free, alphanumeric tokens. */
const tokenize = (s: string): string[] =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/**
 * Length (compact chars) of the term when it appears in the tokens as a whole-word
 * run, so "Pro Plan" and "Proplan" match each other but "Excel" never matches
 * inside "Exceller". Returns 0 when it does not appear.
 */
const termMatchLength = (nameTokens: string[], term: string): number => {
  const compact = tokenize(term).join("");
  if (!compact) return 0;
  for (let i = 0; i < nameTokens.length; i++) {
    let acc = "";
    for (let j = i; j < Math.min(nameTokens.length, i + MAX_RUN); j++) {
      acc += nameTokens[j];
      if (acc === compact) return compact.length;
      if (acc.length >= compact.length) break;
    }
  }
  return 0;
};

const bestTermLength = (nameTokens: string[], terms: string[]): number =>
  terms.reduce((best, t) => Math.max(best, termMatchLength(nameTokens, t)), 0);

type Razas = "RAZAS PEQUEÑAS" | "RAZAS MEDIANAS" | "RAZAS GRANDES";

/** Cell type tokens (whole tokens, accent/case-insensitive) that denote each breed size. */
const RAZAS_CELL_TOKENS: Record<Razas, string[]> = {
  "RAZAS PEQUEÑAS": ["rp", "peq", "pequenas", "mini", "small"],
  "RAZAS MEDIANAS": ["rm", "med", "medianas", "medium"],
  "RAZAS GRANDES": ["rg", "gr", "grandes", "maxi", "large", "giant"],
};

const RAZAS_PHRASE: [RegExp, Razas][] = [
  [/\brazas? pequenas?\b/, "RAZAS PEQUEÑAS"],
  [/\brazas? medianas?\b/, "RAZAS MEDIANAS"],
  [/\brazas? grandes?\b/, "RAZAS GRANDES"],
];

/** Breed size of a product: the phrase written in full, else the shared `razasOf` hints. */
const razasHint = (productName: string): Razas | null => {
  const flat = tokenize(productName).join(" ");
  for (const [re, razas] of RAZAS_PHRASE) if (re.test(flat)) return razas;
  return razasOf(productName, null) as Razas | null;
};

const cellMatchesRazas = (cell: LooseCell, razas: Razas): boolean => {
  const tokens = new Set([cell.typeName, ...cell.typeSynonyms].flatMap(tokenize));
  return RAZAS_CELL_TOKENS[razas].some((t) => tokens.has(t));
};

/**
 * Suggests the loose cells that probably belong to a scanned product, from its
 * name (the scan result carries no brand field): brand by name/keywords, then
 * narrowed by type (name/synonyms) and species (name/category hints). Each
 * narrowing step is skipped when it would leave nothing.
 */
export const suggestLooseCells = (
  productName: string,
  categoryName: string | null | undefined,
  cells: LooseCell[],
): CellSuggestion => {
  const nameTokens = tokenize(productName);

  // 1) Brand: the longest matching term wins; ties keep every brand involved.
  let bestScore = 0;
  let scored: { cell: LooseCell; score: number }[] = [];
  for (const cell of cells) {
    const score = bestTermLength(nameTokens, [cell.brandName, ...cell.brandKeywords]);
    if (score > 0) scored.push({ cell, score });
    bestScore = Math.max(bestScore, score);
  }
  scored = scored.filter((s) => s.score === bestScore);
  if (scored.length === 0) return { cells: [], brandMatched: false };

  let result = scored.map((s) => s.cell);

  // 2) Breed size: razas-specific cells are more specific than the generic stage type.
  const razas = razasHint(productName);
  if (razas) {
    const byRazas = result.filter((c) => cellMatchesRazas(c, razas));
    if (byRazas.length > 0) result = byRazas;
  }

  // 3) Type.
  const byType = result.filter(
    (c) => bestTermLength(nameTokens, [c.typeName, ...c.typeSynonyms]) > 0,
  );
  if (byType.length > 0) result = byType;

  // 4) Species (AMBOS cells fit either).
  const hint = speciesOfName(`${productName} ${categoryName ?? ""}`);
  if (hint) {
    const bySpecies = result.filter((c) => c.species === hint || c.species === "AMBOS");
    if (bySpecies.length > 0) result = bySpecies;
  }

  return { cells: result, brandMatched: true };
};

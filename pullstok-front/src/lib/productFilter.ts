import type { DataItem } from "@/types";

/**
 * Parseo del filtro de búsqueda de productos.
 *
 * Semántica:
 * - La COMA separa términos ALTERNATIVOS (OR) — permite buscar por varias
 *   marcas: "Purina, Proplan" matchea productos de cualquiera de las dos.
 * - Dentro de cada término, los ESPACIOS son AND de palabras (comportamiento
 *   original): "cat chow" matchea productos cuyo haystack contenga ambas.
 *
 * Devuelve los términos ya normalizados (lowercase, palabras por término).
 * Un filtro vacío o solo comas → [] (sin filtro).
 */
export function parseFilterTerms(filter: string): string[][] {
  return filter
    .split(",")
    .map((term) =>
      term
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 0),
    )
    .filter((term) => term.length > 0);
}

/**
 * Haystack sobre el que se matchea: nombre + código + valores de variantes
 * (incluye la marca). Mismo criterio que usaba el Dashboard original.
 */
export function productHaystack(product: DataItem): string {
  type VariantAssignment = { option?: { value?: string } };
  const variantValues = (product as unknown as {
    variantAssignments?: VariantAssignment[];
  })
    ?.variantAssignments?.map((pv) => pv.option?.value ?? "")
    .join(" ");
  return `${product.name} ${product.code || ""} ${variantValues || ""}`.toLowerCase();
}

// Sinónimos de RAZA (razas pequeñas vs medianas/grandes). Mantener las listas
// EXACTAMENTE iguales al backend (api/src/controllers/productController.ts).
const SMALL_BREED_PHRASES = [
  "sm", "razas pequeñas", "razas pequenas", "raza pequeña", "raza pequena",
  "razas peq", "raza peq", "small breed", "razas chicas", "razas mini",
  "talla pequeña", "talla pequena",
];
const LARGE_BREED_PHRASES = [
  "lg", "m&g", "razas m&g", "razas medianas o grandes", "razas medianas y grandes",
  "razas medianas", "razas grandes", "raza mediana", "raza grande", "large breed",
];
const SMALL_REMOVE = ["razas", "raza", "pequeña", "pequeñas", "pequena", "pequenas", "peq", "chicas", "mini", "talla", "small", "breed"];
const LARGE_REMOVE = ["razas", "raza", "mediana", "medianas", "grande", "grandes", "m&g", "o", "y", "talla", "large", "breed"];

/**
 * Detecta raza dentro de un término. Devuelve las palabras "regulares" (AND)
 * y los tokens de búsqueda de raza (OR). Con breedTokens vacío el resultado
 * es el comportamiento original.
 */
export function extractBreed(words: string[]): {
  regular: string[];
  breedTokens: string[];
} {
  const term = words.join(" ");
  const smallActive = SMALL_BREED_PHRASES.some((p) => term.includes(p));
  const largeActive = LARGE_BREED_PHRASES.some((p) => term.includes(p));
  let regular = words;
  let breedTokens: string[] = [];
  if (smallActive) {
    regular = regular.filter((w) => !SMALL_REMOVE.includes(w));
    breedTokens = breedTokens.concat(SMALL_BREED_PHRASES);
  }
  if (largeActive) {
    regular = regular.filter((w) => !LARGE_REMOVE.includes(w));
    breedTokens = breedTokens.concat(LARGE_BREED_PHRASES);
  }
  return { regular, breedTokens };
}

/**
 * Matchea un producto contra el filtro. OR entre términos (coma); AND de
 * palabras dentro de cada término, con OR de sinónimos de raza cuando el
 * término menciona razas. Un producto sin términos → true.
 */
export function matchesProductFilter(
  product: DataItem,
  terms: string[][],
): boolean {
  if (terms.length === 0) return true;
  const haystack = productHaystack(product);
  return terms.some((term) => {
    const { regular, breedTokens } = extractBreed(term);
    const baseOk = regular.every((w) => haystack.includes(w));
    if (!baseOk) return false;
    return breedTokens.length === 0 || breedTokens.some((t) => haystack.includes(t));
  });
}

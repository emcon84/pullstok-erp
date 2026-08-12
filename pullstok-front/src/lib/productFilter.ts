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

/**
 * Matchea un producto contra el filtro. OR entre términos (coma); AND de
 * palabras dentro de cada término. Un producto sin términos → true.
 */
export function matchesProductFilter(
  product: DataItem,
  terms: string[][],
): boolean {
  if (terms.length === 0) return true;
  const haystack = productHaystack(product);
  return terms.some((term) => term.every((w) => haystack.includes(w)));
}

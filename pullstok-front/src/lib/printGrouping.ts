/**
 * Agrupación para listados imprimibles: cuando hay más de una marca, la
 * planilla se divide por títulos por marca (ej: "Purina" y sus productos,
 * después "Proplan" y los suyos).
 */

export interface PrintGroup<T> {
  brand: string;
  items: T[];
}

/**
 * Agrupa items por marca. Devuelve los grupos ordenados por nombre de marca
 * (locale "es"), con "Sin marca" al final. Dentro de cada grupo los items se
 * ordenan con el comparador recibido.
 */
export function groupByBrand<T>(
  items: T[],
  brandOf: (item: T) => string,
  sortItems: (a: T, b: T) => number,
): PrintGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const brand = brandOf(item).trim() || "Sin marca";
    if (!groups.has(brand)) groups.set(brand, []);
    groups.get(brand)!.push(item);
  }
  return [...groups.entries()]
    .map(([brand, groupItems]) => ({
      brand,
      items: [...groupItems].sort(sortItems),
    }))
    .sort((a, b) => {
      if (a.brand === "Sin marca") return 1;
      if (b.brand === "Sin marca") return -1;
      return a.brand.localeCompare(b.brand, "es", { sensitivity: "base" });
    });
}

/**
 * Marca de un DataItem (dashboard): primer option.value de la variante "Marca".
 * Devuelve "" si el producto no tiene marca asignada. Acepta unknown para ser
 * compatible con cualquier callback de groupByBrand (contravariance estricta).
 */
export function productBrandOf(product: unknown): string {
  const p = product as {
    variantAssignments?: {
      option?: { value?: string; variant?: { name?: string } };
    }[];
  };
  return (
    p.variantAssignments?.find(
      (a) => a.option?.variant?.name === "Marca",
    )?.option?.value ?? ""
  );
}

// ---------------------------------------------------------------------------
// Jerarquía DEL PDF para la planilla mayorista (sdd/alican-wholesale-price-list)
// ---------------------------------------------------------------------------

export interface PdfHierarchySection<T> {
  id: string;
  brand: string | null;
  line: string | null;
  subline: string | null;
  position: number;
  entries: T[];
}

/**
 * Normaliza la jerarquía del PDF para impresión/render: ordena secciones por
 * position y entradas por position, y descarta secciones sin entradas. La API
 * (GET /price-lists/:id) YA devuelve la jerarquía agrupada en orden; este
 * helper garantiza el orden y limpia secciones vacías sin reinventar el
 * agrupamiento (decisión del design: no reagrupar en el front).
 */
export function groupByPdfHierarchy<T extends { position: number }>(
  sections: PdfHierarchySection<T>[],
): PdfHierarchySection<T>[] {
  return [...sections]
    .map((s) => ({
      ...s,
      entries: [...s.entries].sort((a, b) => a.position - b.position),
    }))
    .sort((a, b) => a.position - b.position)
    .filter((s) => s.entries.length > 0);
}

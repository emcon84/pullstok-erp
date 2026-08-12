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
 * Devuelve "" si el producto no tiene marca asignada.
 */
export function productBrandOf(product: {
  variantAssignments?: {
    option?: { value?: string; variant?: { name?: string } };
  }[];
}): string {
  return (
    product.variantAssignments?.find(
      (a) => a.option?.variant?.name === "Marca",
    )?.option?.value ?? ""
  );
}

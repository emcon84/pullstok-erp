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
// Títulos de planilla SECO (sdd/alican-plan-titles)
// ---------------------------------------------------------------------------

export interface PlanSection {
  brand: string | null;
  line: string | null;
  subline: string | null;
  position: number;
}

/**
 * Título de planilla de un producto (sdd/alican-plan-titles): LABEL usado para
 * agrupar/encabezar. Regla exacta del backend: subline ?? brand. Vacío si el
 * producto no tiene sección de planilla (o la sección no tiene subline ni
 * brand).
 */
export function planTitleOf(p: {
  planSection?: PlanSection | null;
}): string {
  return p.planSection?.subline ?? p.planSection?.brand ?? "";
}

/**
 * Clave compuesta [brand, line, subline].filter(Boolean).join("|") — contract
 * exacto con GET /products?title= y con las facets (títulos) del backend. Se
 * usa para el filtro client-side del dashboard: los chips se comparan por key,
 * no por label.
 */
export function planTitleKeyOf(p: {
  planSection?: PlanSection | null;
}): string {
  const s = p.planSection;
  return s ? [s.brand, s.line, s.subline].filter(Boolean).join("|") : "";
}

export interface PlanTitleGroup<T> {
  title: string;
  items: T[];
}

const planTitlePositionOf = (item: unknown): number => {
  const s = (item as { planSection?: { position?: number } | null })?.planSection;
  return typeof s?.position === "number" ? s.position : Infinity;
};

const sortByName = (a: unknown, b: unknown) =>
  String((a as { name?: string }).name ?? "").localeCompare(
    String((b as { name?: string }).name ?? ""),
    "es",
    { sensitivity: "base" },
  );

/**
 * Agrupa items por título de planilla para impresión. Preserva el orden del
 * PDF: los grupos con sección se ordenan por position (mínima) y luego
 * alfabético. Los productos SIN planSection caen a su marca (productBrandOf) y
 * los que no tienen marca ni sección van al bucket final "Sin marca". Dentro de
 * cada grupo los items se ordenan por nombre (locale es).
 */
export function groupByPlanTitle<T>(products: T[]): PlanTitleGroup<T>[] {
  const byLabel = new Map<
    string,
    { title: string; position: number; items: T[] }
  >();

  const bucketFor = (title: string, position = Infinity) => {
    const entry = byLabel.get(title) ?? { title, position, items: [] };
    return entry;
  };

  for (const item of products) {
    const label = planTitleOf(item as { planSection?: PlanSection | null });
    if (label) {
      const entry = bucketFor(label);
      const pos = planTitlePositionOf(item);
      if (pos !== Infinity) entry.position = Math.min(entry.position, pos);
      entry.items.push(item);
      byLabel.set(label, entry);
    } else {
      const brand = productBrandOf(item).trim();
      const title = brand || "Sin marca";
      const entry = bucketFor(title);
      entry.items.push(item);
      byLabel.set(title, entry);
    }
  }

  const groups = [...byLabel.values()]
    .map((g) => ({ title: g.title, items: [...g.items].sort(sortByName) }))
    .sort((a, b) => {
      if (a.title === "Sin marca") return 1;
      if (b.title === "Sin marca") return -1;
      const pa = byLabel.get(a.title)!.position;
      const pb = byLabel.get(b.title)!.position;
      if (pa !== pb) return pa - pb;
      return a.title.localeCompare(b.title, "es", { sensitivity: "base" });
    });

  return groups;
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

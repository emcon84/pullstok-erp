/**
 * Utilidades puras de presentaciones de producto (sdd/product-presentations).
 * Sin DB: el stock se guarda en unidad base (factor 1); estas funciones
 * resuelven precio/factor de una línea y desglosan stock por presentación.
 */

// Error de negocio con código estable + status HTTP (el controller lo traduce).
export class PresentationError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "PresentationError";
  }
}

export interface PresentationLike {
  id?: string;
  name: string;
  factor: number;
  price?: number;
  wholesalePrice?: { toString(): string } | number | null;
  isActive: boolean;
}

export interface ResolvedPresentationLine {
  presentationId: string;
  name: string;
  factor: number;
  price: number;
}

export const resolvePresentationLine = (
  product: { hasPresentations: boolean; presentations: PresentationLike[] },
  presentationId: string | null | undefined,
  sellsWholesale: boolean,
): ResolvedPresentationLine => {
  if (!product.hasPresentations) {
    if (presentationId) {
      throw new PresentationError(
        "PRESENTATION_NOT_ALLOWED",
        "El producto no maneja presentaciones",
      );
    }
    throw new PresentationError(
      "PRESENTATION_REQUIRED",
      "El producto no tiene presentaciones habilitadas",
    );
  }
  if (!presentationId) {
    throw new PresentationError("PRESENTATION_REQUIRED", "Elegí una presentación");
  }
  const found = product.presentations.find((p) => p.id === presentationId);
  if (!found) {
    throw new PresentationError(
      "PRESENTATION_NOT_FOUND",
      "La presentación no pertenece al producto",
    );
  }
  if (!found.isActive) {
    throw new PresentationError("PRESENTATION_INACTIVE", "La presentación está inactiva");
  }
  // Precio 0 = "pendiente de precio": no se puede vender.
  if (!found.price || found.price <= 0) {
    throw new PresentationError(
      "PRESENTATION_NOT_SELLABLE",
      "La presentación no tiene precio definido",
    );
  }
  const wholesale =
    found.wholesalePrice === null || found.wholesalePrice === undefined
      ? null
      : Number(found.wholesalePrice.toString());
  return {
    presentationId: found.id as string,
    name: found.name,
    factor: found.factor,
    price: sellsWholesale && wholesale !== null ? wholesale : (found.price as number),
  };
};

/** Desglose greedy del stock base por presentación activa (factor desc). */
export const toStockLevels = (
  baseQty: number,
  presentations: Pick<PresentationLike, "name" | "factor" | "isActive">[],
): { name: string; count: number }[] => {
  // factor 0 = "pendiente": sin contenido definido, no entra en el desglose.
  const active = presentations
    .filter((p) => p.isActive && p.factor >= 1)
    .sort((a, b) => b.factor - a.factor);
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

export const isFarmaciaCategoryName = (name: string | null | undefined): boolean =>
  typeof name === "string" && name.trim().toUpperCase() === "FARMACIA";

/** Un set válido: 1 única activa con factor 1, factores enteros >= 0 (0 = pendiente), nombres únicos. */
export const validatePresentationSet = (
  list: Pick<PresentationLike, "name" | "factor" | "isActive">[],
): void => {
  for (const p of list) {
    if (!Number.isInteger(p.factor) || p.factor < 0) {
      throw new PresentationError(
        "PRESENTATION_FACTOR_INVALID",
        `El factor de "${p.name}" debe ser un entero >= 0`,
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

/** Include Prisma de las presentaciones ACTIVAS (factor desc), filtro explícito por org. */
export const activePresentationsInclude = (organizationId: string) =>
  ({
    where: { organizationId, isActive: true },
    orderBy: { factor: "desc" as const },
    select: {
      id: true,
      name: true,
      factor: true,
      price: true,
      wholesalePrice: true,
      sortOrder: true,
    },
  }) as const;

const toNumber = (v: { toString(): string } | number): number => Number(v.toString());

/** Forma pública de una presentación: precios como number, mayorista null si no hay. */
export const mapPresentation = (p: any) => ({
  id: p.id as string,
  name: p.name as string,
  factor: p.factor as number,
  price: toNumber(p.price),
  wholesalePrice:
    p.wholesalePrice === null || p.wholesalePrice === undefined
      ? null
      : toNumber(p.wholesalePrice),
  sortOrder: p.sortOrder as number,
});

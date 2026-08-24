import { prisma } from "../config/db";
import { findCellForProduct } from "./priceMatchingService";
import { round2 } from "../utils/money";

/**
 * Stock de alimento SUELTO (sdd/loose-lines-stock).
 *
 * El stock suelto vive en LooseStock: una fila por (celda de la planilla
 * PriceKgPrice, sucursal) que acumula los kg abiertos. Se carga con openBag
 * (abrir una bolsa: −1 unidad de ProductStock de bolsas, +weightKg en
 * LooseStock) y se consume en la venta POR_PESO/POR_MONTO (salesService
 * descuenta los kg de acá, no del stock de bolsas).
 *
 * Convensión tenant del repo: fuera del $transaction el scope org lo inyecta
 * la extensión de db.ts (LooseStock está en TENANT_MODELS). DENTRO del
 * $transaction el tx NO hereda el scope → organizationId se pasa EXPLÍCITO en
 * toda query (patrón priceLooseService / priceKgPlanController).
 */

/** Error de dominio con código LOOSE_* (el controller los mapea a 422). */
const looseError = (code: string, message: string): Error => {
  const err: any = new Error(message);
  err.code = code;
  return err;
};

/** Nombre de la línea suelta: "MARCA · TIPO" (fallback cuando no hay looseName). */
export const looseLineName = (brand: string, type: string): string =>
  [brand, type].filter(Boolean).join(" · ");

/** Forma mínima de celda que consumen las funciones (incluye nombres para el SaleItem). */
export interface CellWithNames {
  id: string;
  brandId: string;
  typeId: string;
  species: "PERRO" | "GATO" | "AMBOS";
  priceKg: number;
  brand?: { name: string } | null;
  type?: { name: string } | null;
}

/**
 * Resuelve la celda de la planilla que matchea un producto (reusa el motor de
 * matching de priceMatchingService). Carga producto + categorías, marcas,
 * tipos y celdas con orgId EXPLÍCITO (corre dentro de $transaction). Devuelve
 * la celda o null si el producto no tiene línea en la planilla.
 */
export const resolveCellForProduct = async (
  tx: any,
  orgId: string,
  productId: string,
): Promise<CellWithNames | null> => {
  const product = await tx.product.findFirst({
    where: { id: productId, organizationId: orgId },
    select: { id: true, name: true, categoryId: true, weightKg: true },
  });
  if (!product) return null;

  const [categories, brands, types, cells] = await Promise.all([
    tx.category.findMany({
      where: { organizationId: orgId },
      select: { id: true, name: true, parentId: true },
    }) as Promise<Array<{ id: string; name: string; parentId: string | null }>>,
    tx.priceKgBrand.findMany({
      where: { organizationId: orgId },
      select: { id: true, name: true, keywords: true },
    }),
    tx.priceKgType.findMany({
      where: { organizationId: orgId },
      select: { id: true, name: true, synonyms: true },
    }),
    tx.priceKgPrice.findMany({
      where: { organizationId: orgId },
      select: {
        id: true,
        brandId: true,
        typeId: true,
        species: true,
        priceKg: true,
        brand: { select: { name: true } },
        type: { select: { name: true } },
      },
    }),
  ]);

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const { cell } = findCellForProduct(product, brands, types, categoryById, cells);
  return (cell as CellWithNames) ?? null;
};

/**
 * Abre una bolsa de un producto en una sucursal: descuenta 1 unidad (bolsa) de
 * ProductStock y acredita weightKg en LooseStock de la celda de la planilla.
 * Idempotente por operación (una llamada = una bolsa abierta).
 *
 * Errores de dominio (código → controller 422):
 *  - LOOSE_BAG_NOT_FOUND: el producto no existe en la org.
 *  - LOOSE_BAG_NO_WEIGHT: el producto no tiene weightKg > 0 (no se puede abrir).
 *  - LOOSE_LINE_NOT_FOUND: la celda destino (producto suelto) no existe en la
 *    planilla de la org (la asignación ahora es EXPLÍCITA, no auto-match).
 *  - LOOSE_BAG_INSUFFICIENT_STOCK: sin unidades de bolsa en la sucursal.
 */
export const openBag = async (
  tx: any,
  orgId: string,
  input: { productId: string; branchId: string; priceKgPriceId: string },
): Promise<CellWithNames & { quantity: number }> => {
  const { productId, branchId, priceKgPriceId } = input;

  const product = await tx.product.findFirst({
    where: { id: productId, organizationId: orgId },
    select: { id: true, name: true, categoryId: true, weightKg: true },
  });
  if (!product) {
    throw looseError("LOOSE_BAG_NOT_FOUND", "Producto no encontrado");
  }
  const weightKg = product.weightKg ?? 0;
  if (!(weightKg > 0)) {
    throw looseError(
      "LOOSE_BAG_NO_WEIGHT",
      `"${product.name}" no tiene peso (weightKg) configurado para abrir la bolsa`,
    );
  }

  // Celda destino buscada EXPLÍCITAMENTE por id (dominio + tenant): el usuario
  // elige a qué línea de la planilla se acreditan los kg, sin auto-match.
  const cell = await tx.priceKgPrice.findFirst({
    where: { id: priceKgPriceId, organizationId: orgId },
    include: { brand: { select: { name: true } }, type: { select: { name: true } } },
  });
  if (!cell) {
    throw looseError("LOOSE_LINE_NOT_FOUND", "La línea suelta destino no existe en la planilla");
  }

  // ── Descuento de la bolsa física (stock de sucursal, en UNIDADES) ──
  const updated = await tx.productStock.updateMany({
    where: {
      productId,
      branchId,
      organizationId: orgId,
      quantity: { gte: 1 },
    },
    data: { quantity: { decrement: 1 } },
  });
  if (updated.count === 0) {
    throw looseError(
      "LOOSE_BAG_INSUFFICIENT_STOCK",
      `Stock insuficiente de "${product.name}" en tu sucursal para abrir una bolsa`,
    );
  }

  // ── Acredito los kg al stock suelto de la celda (increment o create) ──
  const existing = await tx.looseStock.findFirst({
    where: { priceKgPriceId: cell.id, branchId, organizationId: orgId },
  });
  if (existing) {
    await tx.looseStock.updateMany({
      where: { id: existing.id, organizationId: orgId },
      data: { quantity: { increment: weightKg } },
    });
  } else {
    await tx.looseStock.create({
      data: {
        priceKgPriceId: cell.id,
        branchId,
        quantity: weightKg,
        organizationId: orgId,
      },
    });
  }

  const row = await tx.looseStock.findFirst({
    where: { priceKgPriceId: cell.id, branchId, organizationId: orgId },
    select: {
      id: true,
      priceKgPriceId: true,
      branchId: true,
      quantity: true,
      organizationId: true,
    },
  });

  return {
    id: row?.id ?? null,
    priceKgPriceId: cell.id,
    branchId,
    quantity: round2(row?.quantity ?? weightKg),
    organizationId: orgId,
    brandId: cell.brandId,
    typeId: cell.typeId,
    species: cell.species,
    priceKg: cell.priceKg,
    brand: cell.brand ?? null,
    type: cell.type ?? null,
  } as unknown as CellWithNames & { quantity: number };
};

const looseStockInclude = {
  priceKgPrice: {
    include: {
      brand: { select: { name: true } },
      type: { select: { name: true } },
    },
  },
  branch: { select: { id: true, name: true } },
} as const;

/**
 * Fija el stock suelto de una CELDA (línea) en una sucursal (PUT
 * ADMIN/MANAGEMENT: ajuste manual de kg / carga inicial). `lineId` es el id de
 * la celda PriceKgPrice (priceKgPriceId), NO el id de la fila LooseStock. Si la
 * fila (celda, sucursal) no existe se crea (find-or-create, patrón tenant:
 * dentro del $transaction orgId EXPLÍCITO).
 */
export const setLooseStock = async (
  tx: any,
  orgId: string,
  input: { lineId: string; branchId: string; quantity: number },
): Promise<{ lineId: string; branchId: string; quantity: number }> => {
  const { lineId, branchId, quantity } = input;
  const qty = round2(quantity);
  const existing = await tx.looseStock.findFirst({
    where: { priceKgPriceId: lineId, branchId, organizationId: orgId },
  });
  if (existing) {
    await tx.looseStock.updateMany({
      where: { id: existing.id, organizationId: orgId },
      data: { quantity: qty },
    });
  } else {
    // El FK priceKgPriceId → price_kg_prices valida que la celda exista.
    await tx.looseStock.create({
      data: { priceKgPriceId: lineId, branchId, quantity: qty, organizationId: orgId },
    });
  }
  return { lineId, branchId, quantity: qty };
};

/**
 * Devuelve el stock suelto de una CELDA (línea) en una sucursal (GET
 * /:lineId?branchId=). `lineId` = id de celda PriceKgPrice. Sin fila todavía →
 * 0 kg (la línea existe pero nadie abrió bolsas / cargó stock). Usa `prisma`
 * (fuera de $transaction) → el scope org lo inyecta la extensión.
 */
export const getLooseStock = async (input: {
  lineId: string;
  branchId: string;
}) => {
  const { lineId, branchId } = input;
  const row = await prisma.looseStock.findFirst({
    where: { priceKgPriceId: lineId, branchId },
    include: looseStockInclude,
  });
  if (!row) {
    return {
      lineId,
      priceKgPriceId: lineId,
      branchId,
      quantity: 0,
      orgId: null,
      brandId: null,
      brandName: null,
      typeId: null,
      typeName: null,
      species: null,
      priceKg: null,
      lineName: "",
      branchName: null,
    };
  }
  return toLooseStockItem(row);
};

/** Lista el stock suelto de la org (GET /), opcionalmente filtrado por sucursal. */
export const listLooseStocks = async (branchId?: string) => {
  const where = branchId ? { branchId } : {};
  const rows = await prisma.looseStock.findMany({
    where,
    include: looseStockInclude,
    orderBy: { quantity: "desc" },
  });
  return rows.map(toLooseStockItem);
};

/** Shape de respuesta de una línea de stock suelto (aplanado para el front). */
const toLooseStockItem = (row: any) => ({
  id: row.id,
  priceKgPriceId: row.priceKgPriceId,
  branchId: row.branchId,
  quantity: row.quantity,
  organizationId: row.organizationId,
  brandId: row.priceKgPrice?.brandId ?? null,
  brandName: row.priceKgPrice?.brand?.name ?? null,
  typeId: row.priceKgPrice?.typeId ?? null,
  typeName: row.priceKgPrice?.type?.name ?? null,
  species: row.priceKgPrice?.species ?? null,
  priceKg: row.priceKgPrice?.priceKg ?? null,
  lineName: looseLineName(
    row.priceKgPrice?.brand?.name ?? "",
    row.priceKgPrice?.type?.name ?? "",
  ),
  branchName: row.branch?.name ?? null,
});

export default {
  looseLineName,
  resolveCellForProduct,
  openBag,
  setLooseStock,
  getLooseStock,
  listLooseStocks,
};

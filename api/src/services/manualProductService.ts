import { prisma } from "../config/db";
import { requireOrganizationId } from "../config/tenantContext";
import { normalizeProductName } from "../utils/productName";

// Categoría raíz especial donde caen los productos cargados a mano desde el POS.
export const MANUAL_CATEGORY_NAME = "Carga manual";

// Error de negocio con status HTTP: el controller lo traduce a la respuesta.
export class ManualProductError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ManualProductError";
  }
}

const categorySelect = { category: { select: { id: true, name: true } } };

/**
 * Busca (o crea) la categoría raíz "Carga manual" de la org actual. El unique
 * [organizationId, parentId, name] NO deduplica parentId NULL en Postgres, por
 * eso es findFirst + create (no upsert).
 */
const getOrCreateManualCategory = async () => {
  const existing = await prisma.category.findFirst({
    where: { name: MANUAL_CATEGORY_NAME, parentId: null },
  });
  if (existing) return existing;
  return prisma.category.create({
    data: {
      name: MANUAL_CATEGORY_NAME,
      parentId: null,
      organizationId: requireOrganizationId(),
    },
  });
};

/**
 * Alta de un producto manual: real (los OrderItem/SaleItem mantienen su FK) pero
 * marcado isManual, sin stock, fuera de la tienda y de "Lo trabajo".
 */
export const createManualProduct = async (input: { name: string; price: number }) => {
  const category = await getOrCreateManualCategory();
  return prisma.product.create({
    data: {
      name: normalizeProductName(input.name),
      price: input.price,
      quantity: 0,
      isManual: true,
      publishedToStore: false,
      carried: false,
      categoryId: category.id,
      organizationId: requireOrganizationId(),
    },
    include: categorySelect,
  });
};

/** Productos manuales pendientes de revisión de la org (admin). */
export const listManualProducts = async () =>
  prisma.product.findMany({
    where: { isManual: true },
    include: categorySelect,
    orderBy: { name: "asc" },
  });

/**
 * "Agregar al sistema": pasa un producto manual a real con una categoría real.
 * 404 si no existe o ya no es manual (updateMany con isManual:true en el where:
 * atómico y scoped por org por la extensión anti-fuga).
 */
export const promoteManualProduct = async (id: string, categoryId: string) => {
  const category = await prisma.category.findFirst({ where: { id: categoryId } });
  if (!category) {
    throw new ManualProductError(400, "La categoría indicada no existe");
  }
  if (category.name === MANUAL_CATEGORY_NAME && category.parentId === null) {
    throw new ManualProductError(
      400,
      `Elegí una categoría distinta de "${MANUAL_CATEGORY_NAME}"`,
    );
  }

  const result = await prisma.product.updateMany({
    where: { id, isManual: true },
    data: { isManual: false, categoryId },
  });
  if (result.count === 0) {
    throw new ManualProductError(404, "Producto manual no encontrado");
  }

  return prisma.product.findFirst({ where: { id }, include: categorySelect });
};

const IN_USE_MESSAGE =
  "No se puede eliminar: el producto está en un pedido o presupuesto";

/**
 * Elimina un producto manual de la org. Solo borra filas con isManual:true (el
 * deleteMany lleva el flag en el where: un producto normal jamás se borra por
 * acá) y queda scoped por org por la extensión anti-fuga.
 *
 * - 404 si no existe / no es manual / es de otra org.
 * - 409 si lo referencia un OrderItem o QuotationItem (FK requerida sin cascada:
 *   no se altera un pedido/presupuesto existente). OrderItem/QuotationItem no
 *   son tenant-scoped, pero el productId ya quedó validado como de la org.
 * - Un manual ya vendido SÍ se borra: SaleItem.productId es opcional (SetNull)
 *   y la línea conserva su propio `name`.
 * - Si una carrera crea la referencia entre el chequeo y el borrado, la FK
 *   (P2003) se traduce al mismo 409.
 */
export const deleteManualProduct = async (id: string): Promise<void> => {
  const product = await prisma.product.findFirst({
    where: { id, isManual: true },
    select: { id: true },
  });
  if (!product) {
    throw new ManualProductError(404, "Producto manual no encontrado");
  }

  const [orderItems, quotationItems] = await Promise.all([
    prisma.orderItem.count({ where: { productId: id } }),
    prisma.quotationItem.count({ where: { productId: id } }),
  ]);
  if (orderItems > 0 || quotationItems > 0) {
    throw new ManualProductError(409, IN_USE_MESSAGE);
  }

  let result: { count: number };
  try {
    result = await prisma.product.deleteMany({ where: { id, isManual: true } });
  } catch (error: any) {
    if (error?.code === "P2003") {
      throw new ManualProductError(409, IN_USE_MESSAGE);
    }
    throw error;
  }
  if (result.count === 0) {
    throw new ManualProductError(404, "Producto manual no encontrado");
  }
};

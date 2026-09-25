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

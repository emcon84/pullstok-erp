import { prisma } from "../config/db";
import { requireOrganizationId } from "../config/tenantContext";
import {
  PresentationError,
  isFarmaciaCategoryName,
  validatePresentationSet,
} from "../utils/presentations";

// Dentro de $transaction la extensión tenant NO aplica: organizationId va
// EXPLÍCITO en cada query y solo se usan ops no singulares (findFirst /
// updateMany / deleteMany / create).

export interface PresentationInput {
  id?: string;
  name: string;
  sortOrder: number;
  factor: number;
  price: number;
  wholesalePrice: number | null;
  isActive: boolean;
}

const loadProduct = async (tx: any, orgId: string, productId: string) => {
  const product = await tx.product.findFirst({
    where: { id: productId, organizationId: orgId },
    include: {
      category: { select: { name: true } },
      presentations: true,
    },
  });
  if (!product) {
    throw new PresentationError("PRODUCT_NOT_FOUND", "Producto no encontrado", 404);
  }
  return product;
};

const assertFarmacia = (product: any) => {
  if (!isFarmaciaCategoryName(product.category?.name)) {
    throw new PresentationError(
      "PRESENTATIONS_FARMACIA_ONLY",
      "Las presentaciones solo están disponibles para productos de FARMACIA",
    );
  }
};

const createRow = (tx: any, orgId: string, productId: string, p: PresentationInput) =>
  tx.productPresentation.create({
    data: {
      organizationId: orgId,
      productId,
      name: p.name.trim(),
      sortOrder: p.sortOrder,
      factor: p.factor,
      price: p.price,
      wholesalePrice: p.wholesalePrice,
      isActive: p.isActive,
    },
  });

const listRows = (tx: any, orgId: string, productId: string) =>
  tx.productPresentation.findMany({
    where: { productId, organizationId: orgId },
    orderBy: { sortOrder: "asc" },
  });

/** Reemplazo total del set de una sola vez (update por id, create, delete del resto). */
export const replacePresentations = (
  productId: string,
  body: { presentations: PresentationInput[] },
) =>
  prisma.$transaction(async (tx: any) => {
    const orgId = requireOrganizationId();
    const product = await loadProduct(tx, orgId, productId);
    assertFarmacia(product);
    if (!product.hasPresentations) {
      throw new PresentationError(
        "PRESENTATIONS_NOT_ENABLED",
        "El producto no tiene presentaciones habilitadas",
        409,
      );
    }
    const list = body.presentations;
    validatePresentationSet(list);

    const existingIds = new Set<string>(product.presentations.map((p: any) => p.id));
    for (const p of list) {
      if (p.id && !existingIds.has(p.id)) {
        throw new PresentationError(
          "PRESENTATION_NOT_FOUND",
          "La presentación no pertenece al producto",
        );
      }
    }
    // La base (activa, factor 1) no se puede quitar, desactivar ni cambiar de factor.
    const currentBase = product.presentations.find((p: any) => p.isActive && p.factor === 1);
    const newBase = list.find((p) => p.isActive && p.factor === 1);
    if (currentBase && newBase?.id !== currentBase.id) {
      throw new PresentationError(
        "PRESENTATION_BASE_LOCKED",
        "La presentación base no se puede quitar ni cambiar de factor",
      );
    }

    // Orden seguro frente a unique(productId,name): primero se borran las
    // quitadas, luego los renombres de las que quedan van en dos fases.
    const keepIds = list.filter((p) => p.id).map((p) => p.id as string);
    await tx.productPresentation.deleteMany({
      where: { productId, organizationId: orgId, id: { notIn: keepIds } },
    });
    const currentName = new Map<string, string>(
      product.presentations.map((p: any) => [p.id, p.name]),
    );
    for (const p of list) {
      if (p.id && currentName.get(p.id) !== p.name.trim()) {
        await tx.productPresentation.updateMany({
          where: { id: p.id, productId, organizationId: orgId },
          data: { name: `__tmp__${p.id}` },
        });
      }
    }
    for (const p of list) {
      if (p.id) {
        await tx.productPresentation.updateMany({
          where: { id: p.id, productId, organizationId: orgId },
          data: {
            name: p.name.trim(),
            sortOrder: p.sortOrder,
            factor: p.factor,
            price: p.price,
            wholesalePrice: p.wholesalePrice,
            isActive: p.isActive,
          },
        });
      }
    }
    for (const p of list) {
      if (!p.id) await createRow(tx, orgId, productId, p);
    }
    return listRows(tx, orgId, productId);
  });

/**
 * Habilita presentaciones: crea el set, marca el producto y convierte el stock
 * existente a unidad base (× factor de la presentación en la que se contaba).
 */
export const enablePresentations = (
  productId: string,
  body: { presentations: PresentationInput[]; stockCountedIn?: string },
) =>
  prisma.$transaction(async (tx: any) => {
    const orgId = requireOrganizationId();
    const product = await loadProduct(tx, orgId, productId);
    assertFarmacia(product);
    if (product.hasPresentations) {
      throw new PresentationError(
        "PRESENTATIONS_ALREADY_ENABLED",
        "El producto ya tiene presentaciones habilitadas",
        409,
      );
    }
    const list = body.presentations;
    validatePresentationSet(list);

    let factor: number;
    if (body.stockCountedIn) {
      const wanted = body.stockCountedIn.trim().toLowerCase();
      const match = list.find((p) => p.name.trim().toLowerCase() === wanted);
      if (!match) {
        throw new PresentationError(
          "PRESENTATION_COUNTED_IN_INVALID",
          "stockCountedIn no coincide con ninguna presentación",
        );
      }
      factor = match.factor;
    } else {
      factor = Math.max(...list.map((p) => p.factor));
    }

    // Restos inactivos de un disable previo: se borran (los snapshots de
    // SaleItem guardan el historial; presentationId es onDelete SetNull).
    await tx.productPresentation.deleteMany({ where: { productId, organizationId: orgId } });
    for (const p of list) await createRow(tx, orgId, productId, p);

    const productData: Record<string, unknown> = { hasPresentations: true };
    if (factor > 1) {
      await tx.productStock.updateMany({
        where: { productId, organizationId: orgId },
        data: { quantity: { multiply: factor } },
      });
      productData.quantity = { multiply: factor };
    }
    await tx.product.updateMany({
      where: { id: productId, organizationId: orgId },
      data: productData,
    });
    return listRows(tx, orgId, productId);
  });

/** Deshabilita presentaciones solo con stock en cero (no hay conversión inversa). */
export const disablePresentations = (productId: string) =>
  prisma.$transaction(async (tx: any) => {
    const orgId = requireOrganizationId();
    const product = await loadProduct(tx, orgId, productId);
    if (!product.hasPresentations) {
      throw new PresentationError(
        "PRESENTATIONS_NOT_ENABLED",
        "El producto no tiene presentaciones habilitadas",
        409,
      );
    }
    const withStock = await tx.productStock.findFirst({
      where: { productId, organizationId: orgId, quantity: { gt: 0 } },
    });
    if (withStock || product.quantity > 0) {
      throw new PresentationError(
        "PRESENTATION_STOCK_NOT_ZERO",
        "No se pueden deshabilitar las presentaciones con stock",
        409,
      );
    }
    await tx.product.updateMany({
      where: { id: productId, organizationId: orgId },
      data: { hasPresentations: false },
    });
    await tx.productPresentation.updateMany({
      where: { productId, organizationId: orgId },
      data: { isActive: false },
    });
    return listRows(tx, orgId, productId);
  });

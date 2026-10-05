import { prisma } from "../config/db";
import { PresentationError } from "../utils/presentations";

/**
 * Presupuestos, pedidos y tienda online NO soportan productos con
 * presentaciones (sdd/product-presentations): solo se venden en el POS.
 * Lanza 400 PRESENTATION_NOT_SUPPORTED si alguno de los ids tiene el flag.
 */
export const assertNoPresentationProducts = async (
  productIds: (string | null | undefined)[],
): Promise<void> => {
  const ids = productIds.filter((id): id is string => !!id);
  if (ids.length === 0) return;
  const found = await prisma.product.findFirst({
    where: { id: { in: ids }, hasPresentations: true },
    select: { id: true, name: true },
  });
  if (found) {
    throw new PresentationError(
      "PRESENTATION_NOT_SUPPORTED",
      `El producto "${found.name}" tiene presentaciones y solo se vende en el POS`,
    );
  }
};

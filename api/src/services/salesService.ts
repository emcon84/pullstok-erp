import { prisma } from "../config/db";
import { requireOrganizationId } from "../config/tenantContext";

interface IProductSale {
  productId: string;
  name: string;
  quantity: number;
  category: string;
  price: number;
}

interface ISaleRequest {
  products: IProductSale[];
}

const createSale = async (saleRequest: ISaleRequest) => {
  const organizationId = requireOrganizationId();

  if (!Array.isArray(saleRequest.products) || saleRequest.products.length === 0) {
    throw new Error("La venta debe incluir al menos un producto");
  }

  // Toda la venta se ejecuta en una transacción: o se descuenta TODO el stock
  // y se crea la venta, o no se toca nada. Evita el "stock fantasma".
  return prisma.$transaction(async (tx) => {
    let totalAmount = 0;
    const saleItems: {
      productId: string;
      name: string;
      quantity: number;
      category: string;
      price: number;
    }[] = [];

    for (const item of saleRequest.products) {
      if (!item.productId || !item.quantity || !item.price) {
        throw new Error("Faltan campos requeridos en un producto de la venta");
      }

      const quantity = parseInt(String(item.quantity), 10);
      const price = parseFloat(String(item.price));

      const product = await tx.product.findFirst({
        where: { id: item.productId, organizationId },
        include: { category: true },
      });
      if (!product) {
        throw new Error(`Producto ${item.productId} no encontrado`);
      }
      if (product.quantity < quantity) {
        throw new Error(`Stock insuficiente para el producto ${product.name}`);
      }

      // Descuento atómico y condicionado: solo descuenta si todavía hay stock.
      const updated = await tx.product.updateMany({
        where: { id: product.id, organizationId, quantity: { gte: quantity } },
        data: { quantity: { decrement: quantity } },
      });
      if (updated.count === 0) {
        throw new Error(`Stock insuficiente para el producto ${product.name}`);
      }

      saleItems.push({
        productId: product.id,
        name: product.name,
        quantity,
        // SaleItem.category es snapshot histórico (string), no FK: queda
        // congelado el nombre de categoría al momento de la venta aunque la
        // Category se renombre o borre después.
        category: product.category?.name ?? "Sin categoría",
        price,
      });
      totalAmount += price * quantity;
    }

    return tx.sale.create({
      data: {
        organizationId,
        totalAmount,
        items: { create: saleItems },
      },
      include: { items: true },
    });
  });
};

const getAllSales = async () => {
  return prisma.sale.findMany({
    include: { items: { include: { product: true } } },
  });
};

const getSaleById = async (id: string) => {
  return prisma.sale.findFirst({
    where: { id },
    include: { items: { include: { product: true } } },
  });
};

export default {
  createSale,
  getAllSales,
  getSaleById,
};

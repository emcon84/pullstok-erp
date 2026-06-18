import { prisma } from "../config/db";

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
  let totalAmount = 0;
  const saleItems: any[] = [];

  for (const productSaleRequest of saleRequest.products) {
    if (
      !productSaleRequest.productId ||
      !productSaleRequest.name ||
      !productSaleRequest.quantity ||
      !productSaleRequest.price
    ) {
      throw new Error("Missing required fields in product sale request");
    }

    const product = await prisma.product.findUnique({
      where: { id: productSaleRequest.productId },
    });

    if (!product) {
      throw new Error(
        `Product with ID ${productSaleRequest.productId} not found`,
      );
    }

    const quantity = parseInt(productSaleRequest.quantity.toString());
    const price = parseFloat(productSaleRequest.price.toString());

    if (product.quantity < quantity) {
      throw new Error(`Not enough stock for product ${product.name}`);
    }

    // Actualizar cantidad del producto
    await prisma.product.update({
      where: { id: product.id },
      data: { quantity: product.quantity - quantity },
    });

    saleItems.push({
      productId: product.id,
      name: product.name,
      quantity: quantity,
      category: product.category,
      price: price,
    });

    totalAmount += price * quantity;
  }

  const sale = await prisma.sale.create({
    data: {
      totalAmount,
      items: {
        create: saleItems,
      },
    },
    include: {
      items: true,
    },
  });

  return sale;
};

const getAllSales = async () => {
  return await prisma.sale.findMany({
    include: {
      items: {
        include: {
          product: true,
        },
      },
    },
  });
};

const getSaleById = async (id: string) => {
  return await prisma.sale.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          product: true,
        },
      },
    },
  });
};

export default {
  createSale,
  getAllSales,
  getSaleById,
};

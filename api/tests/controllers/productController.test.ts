import { Request, Response } from 'express';
import productController from '../../src/controllers/productController';
import { prisma } from '../../src/config/db';

jest.mock('../../src/config/db', () => ({
  prisma: {
    category: {
      findFirst: jest.fn(),
    },
    product: {
      create: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    categoryVariantOption: {
      findMany: jest.fn(),
    },
    productVariant: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    branch: {
      findFirst: jest.fn(),
    },
    productStock: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock('../../src/config/tenantContext', () => ({
  requireOrganizationId: jest.fn().mockReturnValue('org-1'),
}));

jest.mock('../../src/services/priceLooseService', () => ({
  recomputeForProduct: jest.fn().mockResolvedValue({ affected: 0, priceKgSuelto: null }),
  recomputeForBulkPriceUpdate: jest.fn().mockResolvedValue({ affected: 0 }),
  recomputeForCsvImport: jest.fn().mockResolvedValue({ affected: 0 }),
}));

const mockedPrisma = prisma as unknown as {
  category: { findFirst: jest.Mock };
  product: { create: jest.Mock; findFirst: jest.Mock; updateMany: jest.Mock };
  categoryVariantOption: { findMany: jest.Mock };
  productVariant: { createMany: jest.Mock; deleteMany: jest.Mock };
  branch: { findFirst: jest.Mock };
  productStock: { findFirst: jest.Mock; updateMany: jest.Mock; create: jest.Mock };
  $transaction: jest.Mock;
};

const mockRequest = (body: any) => ({ body } as Request);
const mockParamsRequest = (body: any, id: string) =>
  ({ body, params: { id } } as unknown as Request);
const mockResponse = () => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('productController.createProduct', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('crea el producto si el categoryId existe y pertenece a la organización', async () => {
    const categoryId = 'cat-1';
    mockedPrisma.category.findFirst.mockResolvedValue({ id: categoryId, name: 'Herramientas' });
    const createdProduct = { id: 'prod-1', name: 'Martillo', categoryId };
    mockedPrisma.product.create.mockResolvedValue(createdProduct);
    mockedPrisma.product.findFirst.mockResolvedValue(createdProduct);

    const req = mockRequest({ name: 'Martillo', price: 100, quantity: 5, categoryId });
    const res = mockResponse();

    await productController.createProduct(req, res);

    expect(mockedPrisma.category.findFirst).toHaveBeenCalledWith({ where: { id: categoryId } });
    expect(mockedPrisma.product.create).toHaveBeenCalledWith({
      data: { name: 'Martillo', price: 100, quantity: 5, categoryId },
    });
    // syncHqStock se dispara al crear con quantity en el body (spec D4):
    // ProductStock(HQ) y Product.quantity quedan sincronizados.
    expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(createdProduct);
  });

  it('rechaza con 400 si el categoryId no existe', async () => {
    mockedPrisma.category.findFirst.mockResolvedValue(null);

    const req = mockRequest({ name: 'Martillo', price: 100, quantity: 5, categoryId: 'cat-inexistente' });
    const res = mockResponse();

    await productController.createProduct(req, res);

    expect(mockedPrisma.product.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'La categoría indicada no existe' });
  });

  it('rechaza con 400 si el categoryId pertenece a otra organización (findFirst no la encuentra por scope automático)', async () => {
    mockedPrisma.category.findFirst.mockResolvedValue(null);

    const req = mockRequest({
      name: 'Martillo',
      price: 100,
      quantity: 5,
      categoryId: 'cat-cross-tenant',
    });
    const res = mockResponse();

    await productController.createProduct(req, res);

    expect(mockedPrisma.product.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'La categoría indicada no existe' });
  });
});

describe('productController.updateProduct', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rechaza con 400 si al cambiar la categoría las variantes no pertenecen a la nueva categoría (sin borrar nada)', async () => {
    mockedPrisma.product.findFirst.mockResolvedValue({ categoryId: 'cat-vieja' });
    // Solo una de las dos opciones pertenece a la nueva categoría → mismatch.
    mockedPrisma.categoryVariantOption.findMany.mockResolvedValue([{ id: 'opt-1' }]);

    const req = mockParamsRequest(
      { name: 'Martillo', categoryId: 'cat-nueva', variantOptionIds: ['opt-1', 'opt-foraneo'] },
      'prod-1',
    );
    const res = mockResponse();

    await productController.updateProduct(req, res);

    expect(mockedPrisma.categoryVariantOption.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['opt-1', 'opt-foraneo'] }, variant: { categoryId: 'cat-nueva' } },
    });
    expect(mockedPrisma.productVariant.deleteMany).not.toHaveBeenCalled();
    expect(mockedPrisma.product.updateMany).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Algunas opciones de variante no pertenecen a esta categoría',
    });
  });

  it('acepta un cambio de categoría con variantOptionIds vacío (limpia las asignaciones, 200)', async () => {
    mockedPrisma.product.findFirst
      .mockResolvedValueOnce({ categoryId: 'cat-vieja' })
      .mockResolvedValueOnce({ id: 'prod-1', name: 'Martillo', categoryId: 'cat-nueva' });
    mockedPrisma.product.updateMany.mockResolvedValue({ count: 1 });

    const req = mockParamsRequest(
      { name: 'Martillo', categoryId: 'cat-nueva', variantOptionIds: [] },
      'prod-1',
    );
    const res = mockResponse();

    await productController.updateProduct(req, res);

    // Se borran las asignaciones viejas (cambio de categoría) y no se insertan nuevas.
    expect(mockedPrisma.productVariant.deleteMany).toHaveBeenCalledWith({
      where: { productId: 'prod-1' },
    });
    expect(mockedPrisma.productVariant.createMany).not.toHaveBeenCalled();
    expect(mockedPrisma.categoryVariantOption.findMany).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

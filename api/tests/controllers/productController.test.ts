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
    },
    categoryVariantOption: {
      findMany: jest.fn(),
    },
    productVariant: {
      createMany: jest.fn(),
    },
  },
}));

jest.mock('../../src/config/tenantContext', () => ({
  requireOrganizationId: jest.fn().mockReturnValue('org-1'),
}));

const mockedPrisma = prisma as unknown as {
  category: { findFirst: jest.Mock };
  product: { create: jest.Mock; findFirst: jest.Mock };
  categoryVariantOption: { findMany: jest.Mock };
  productVariant: { createMany: jest.Mock };
};

const mockRequest = (body: any) => ({ body } as Request);
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

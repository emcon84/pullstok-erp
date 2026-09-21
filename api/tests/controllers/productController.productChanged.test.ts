import { Request, Response } from "express";
import productController from "../../src/controllers/productController";
import { prisma } from "../../src/config/db";
import { emitProductChanged } from "../../src/realtime/socket";

jest.mock("../../src/config/db", () => ({
  prisma: {
    category: { findFirst: jest.fn() },
    product: {
      create: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    categoryVariantOption: { findMany: jest.fn() },
    productVariant: { createMany: jest.fn(), deleteMany: jest.fn() },
    orderItem: { findFirst: jest.fn() },
    quotationItem: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  },
  basePrisma: {},
}));

jest.mock("../../src/config/tenantContext", () => ({
  requireOrganizationId: jest.fn().mockReturnValue("org-1"),
}));

jest.mock("../../src/services/priceLooseService", () => ({
  recomputeForProduct: jest.fn().mockResolvedValue({ affected: 0, priceKgSuelto: null }),
  recomputeForBulkPriceUpdate: jest.fn().mockResolvedValue({ affected: 0 }),
  recomputeForCsvImport: jest.fn().mockResolvedValue({ affected: 0 }),
}));

jest.mock("../../src/services/stockService", () => ({
  syncHqStock: jest.fn().mockResolvedValue(undefined),
  canEditBranchStock: jest.fn().mockReturnValue(true),
  getStockSummary: jest.fn().mockResolvedValue({ total: 0, branches: [] }),
}));

jest.mock("../../src/realtime/socket", () => ({
  emitProductChanged: jest.fn(),
}));

const mockedPrisma = prisma as unknown as {
  category: { findFirst: jest.Mock };
  product: {
    create: jest.Mock;
    findFirst: jest.Mock;
    updateMany: jest.Mock;
    deleteMany: jest.Mock;
  };
  categoryVariantOption: { findMany: jest.Mock };
  productVariant: { createMany: jest.Mock; deleteMany: jest.Mock };
  orderItem: { findFirst: jest.Mock };
  quotationItem: { findFirst: jest.Mock };
  $transaction: jest.Mock;
};

const mockedEmitProductChanged = emitProductChanged as jest.Mock;

const mockRequest = (body: any) => ({ body } as Request);
const mockParamsRequest = (body: any, id: string) =>
  ({ body, params: { id } } as unknown as Request);
const mockIdRequest = (id: string) => ({ params: { id } } as unknown as Request);

const mockResponse = () => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("productController — emitProductChanged wiring", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createProduct", () => {
    it('emite "created" con el id del producto recién creado tras un alta exitosa', async () => {
      const categoryId = "cat-1";
      mockedPrisma.category.findFirst.mockResolvedValue({ id: categoryId, name: "Herramientas" });
      const createdProduct = { id: "prod-1", name: "Martillo", categoryId };
      mockedPrisma.product.create.mockResolvedValue(createdProduct);
      mockedPrisma.product.findFirst.mockResolvedValue(createdProduct);

      const req = mockRequest({ name: "Martillo", price: 100, categoryId });
      const res = mockResponse();

      await productController.createProduct(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockedEmitProductChanged).toHaveBeenCalledTimes(1);
      expect(mockedEmitProductChanged).toHaveBeenCalledWith("org-1", "prod-1", "created");
    });

    it("NO emite nada si la categoría no existe (create falla con 400)", async () => {
      mockedPrisma.category.findFirst.mockResolvedValue(null);

      const req = mockRequest({ name: "Martillo", price: 100, categoryId: "cat-inexistente" });
      const res = mockResponse();

      await productController.createProduct(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockedEmitProductChanged).not.toHaveBeenCalled();
    });
  });

  describe("updateProduct", () => {
    it('emite "updated" tras una edición exitosa', async () => {
      mockedPrisma.product.updateMany.mockResolvedValue({ count: 1 });
      const updatedProduct = { id: "prod-1", name: "Martillo XL" };
      mockedPrisma.product.findFirst.mockResolvedValue(updatedProduct);

      const req = mockParamsRequest({ name: "Martillo XL" }, "prod-1");
      const res = mockResponse();

      await productController.updateProduct(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockedEmitProductChanged).toHaveBeenCalledTimes(1);
      expect(mockedEmitProductChanged).toHaveBeenCalledWith("org-1", "prod-1", "updated");
    });

    it("NO emite nada si el producto no existe (updateMany.count === 0 → 404)", async () => {
      mockedPrisma.product.updateMany.mockResolvedValue({ count: 0 });

      const req = mockParamsRequest({ name: "Martillo XL" }, "prod-inexistente");
      const res = mockResponse();

      await productController.updateProduct(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(mockedEmitProductChanged).not.toHaveBeenCalled();
    });
  });

  describe("deleteProduct", () => {
    it('emite "deleted" con el id del producto borrado tras un borrado exitoso', async () => {
      mockedPrisma.product.findFirst.mockResolvedValue({ id: "prod-1", name: "Martillo" });
      mockedPrisma.orderItem.findFirst.mockResolvedValue(null);
      mockedPrisma.quotationItem.findFirst.mockResolvedValue(null);
      mockedPrisma.product.deleteMany.mockResolvedValue({ count: 1 });

      const req = mockIdRequest("prod-1");
      const res = mockResponse();

      await productController.deleteProduct(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockedEmitProductChanged).toHaveBeenCalledTimes(1);
      expect(mockedEmitProductChanged).toHaveBeenCalledWith("org-1", "prod-1", "deleted");
    });

    it("NO emite nada si el producto no existe (404)", async () => {
      mockedPrisma.product.findFirst.mockResolvedValue(null);

      const req = mockIdRequest("prod-inexistente");
      const res = mockResponse();

      await productController.deleteProduct(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(mockedEmitProductChanged).not.toHaveBeenCalled();
    });

    it("NO emite nada si el producto tiene órdenes asociadas (400, no se borra)", async () => {
      mockedPrisma.product.findFirst.mockResolvedValue({ id: "prod-1", name: "Martillo" });
      mockedPrisma.orderItem.findFirst.mockResolvedValue({ id: "item-1" });

      const req = mockIdRequest("prod-1");
      const res = mockResponse();

      await productController.deleteProduct(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockedPrisma.product.deleteMany).not.toHaveBeenCalled();
      expect(mockedEmitProductChanged).not.toHaveBeenCalled();
    });
  });
});

import { Request, Response } from "express";
import productController from "../../src/controllers/productController";
import { prisma } from "../../src/config/db";

// sdd: odd/tasks/listado-productos-sin-stock.md (T1) — sin `?branchId=`,
// `getProducts` debe agregar el stock real (`ProductStock`) en vez de dejar
// `stocks` sin adjuntar (lo que hacía caer al front al fallback legacy
// `Product.quantity`, desactualizado para productos cargados vía scripts
// masivos recientes).
jest.mock("../../src/config/db", () => ({
  prisma: {
    product: { findMany: jest.fn(), count: jest.fn() },
    productStock: { groupBy: jest.fn() },
    priceKgType: { findMany: jest.fn() },
  },
  basePrisma: {},
}));

jest.mock("../../src/config/tenantContext", () => ({
  requireOrganizationId: jest.fn().mockReturnValue("org-1"),
}));

const mockedPrisma = prisma as unknown as {
  product: { findMany: jest.Mock; count: jest.Mock };
  productStock: { groupBy: jest.Mock };
  priceKgType: { findMany: jest.Mock };
};

const mockRequest = (query: Record<string, string> = {}) =>
  ({ query } as unknown as Request);

const mockResponse = () => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  return res;
};

describe("productController.getProducts — agregado de stock sin branchId", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedPrisma.priceKgType.findMany.mockResolvedValue([]);
    mockedPrisma.product.count.mockResolvedValue(0);
  });

  describe("lista plana (sin page/pageSize)", () => {
    it("producto sin filas de ProductStock → stocks: [{ quantity: 0 }]", async () => {
      mockedPrisma.product.findMany.mockResolvedValue([{ id: "p-1", name: "Sin stock" }]);
      mockedPrisma.productStock.groupBy.mockResolvedValue([]);
      const res = mockResponse();

      await productController.getProducts(mockRequest(), res);

      const body = (res.json as jest.Mock).mock.calls[0][0];
      expect(body[0].stocks).toEqual([{ quantity: 0 }]);
    });

    it("producto con stock en 5 sucursales (100 c/u) → stocks: [{ quantity: 500 }]", async () => {
      mockedPrisma.product.findMany.mockResolvedValue([{ id: "p-1", name: "Con stock" }]);
      mockedPrisma.productStock.groupBy.mockResolvedValue([
        { productId: "p-1", _sum: { quantity: 500 } },
      ]);
      const res = mockResponse();

      await productController.getProducts(mockRequest(), res);

      const body = (res.json as jest.Mock).mock.calls[0][0];
      expect(body[0].stocks).toEqual([{ quantity: 500 }]);
      expect(mockedPrisma.productStock.groupBy).toHaveBeenCalledWith({
        by: ["productId"],
        where: { productId: { in: ["p-1"] } },
        _sum: { quantity: true },
      });
    });
  });

  describe("lista paginada (page/pageSize presentes)", () => {
    it("producto sin filas de ProductStock → stocks: [{ quantity: 0 }]", async () => {
      mockedPrisma.product.findMany.mockResolvedValue([{ id: "p-1", name: "Sin stock" }]);
      mockedPrisma.product.count.mockResolvedValue(1);
      mockedPrisma.productStock.groupBy.mockResolvedValue([]);
      const res = mockResponse();

      await productController.getProducts(mockRequest({ page: "1", pageSize: "30" }), res);

      const body = (res.json as jest.Mock).mock.calls[0][0];
      expect(body.items[0].stocks).toEqual([{ quantity: 0 }]);
    });

    it("producto con stock en 5 sucursales (100 c/u) → stocks: [{ quantity: 500 }]", async () => {
      mockedPrisma.product.findMany.mockResolvedValue([{ id: "p-1", name: "Con stock" }]);
      mockedPrisma.product.count.mockResolvedValue(1);
      mockedPrisma.productStock.groupBy.mockResolvedValue([
        { productId: "p-1", _sum: { quantity: 500 } },
      ]);
      const res = mockResponse();

      await productController.getProducts(mockRequest({ page: "1", pageSize: "30" }), res);

      const body = (res.json as jest.Mock).mock.calls[0][0];
      expect(body.items[0].stocks).toEqual([{ quantity: 500 }]);
    });

    it("agrega con UNA sola query (groupBy), no una por producto", async () => {
      mockedPrisma.product.findMany.mockResolvedValue([
        { id: "p-1", name: "A" },
        { id: "p-2", name: "B" },
        { id: "p-3", name: "C" },
      ]);
      mockedPrisma.product.count.mockResolvedValue(3);
      mockedPrisma.productStock.groupBy.mockResolvedValue([
        { productId: "p-1", _sum: { quantity: 100 } },
        { productId: "p-2", _sum: { quantity: 200 } },
      ]);
      const res = mockResponse();

      await productController.getProducts(mockRequest({ page: "1", pageSize: "30" }), res);

      expect(mockedPrisma.productStock.groupBy).toHaveBeenCalledTimes(1);
      const body = (res.json as jest.Mock).mock.calls[0][0];
      expect(body.items[0].stocks).toEqual([{ quantity: 100 }]);
      expect(body.items[1].stocks).toEqual([{ quantity: 200 }]);
      expect(body.items[2].stocks).toEqual([{ quantity: 0 }]);
    });
  });

  describe("con branchId: comportamiento sin cambios (byte-for-byte)", () => {
    it("lista plana: NO corre el groupBy agregado, stocks viene solo del include existente", async () => {
      mockedPrisma.product.findMany.mockResolvedValue([
        { id: "p-1", name: "X", stocks: [{ quantity: 7 }] },
      ]);
      const res = mockResponse();

      await productController.getProducts(mockRequest({ branchId: "br-1" }), res);

      expect(mockedPrisma.productStock.groupBy).not.toHaveBeenCalled();
      const body = (res.json as jest.Mock).mock.calls[0][0];
      expect(body[0].stocks).toEqual([{ quantity: 7 }]);
    });

    it("lista paginada: NO corre el groupBy agregado, stocks viene solo del include existente", async () => {
      mockedPrisma.product.findMany.mockResolvedValue([
        { id: "p-1", name: "X", stocks: [{ quantity: 7 }] },
      ]);
      mockedPrisma.product.count.mockResolvedValue(1);
      const res = mockResponse();

      await productController.getProducts(
        mockRequest({ branchId: "br-1", page: "1", pageSize: "30" }),
        res,
      );

      expect(mockedPrisma.productStock.groupBy).not.toHaveBeenCalled();
      const body = (res.json as jest.Mock).mock.calls[0][0];
      expect(body.items[0].stocks).toEqual([{ quantity: 7 }]);
    });
  });
});

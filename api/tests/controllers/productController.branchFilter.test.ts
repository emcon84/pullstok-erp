import { Request, Response } from "express";
import productController from "../../src/controllers/productController";
import { prisma } from "../../src/config/db";

jest.mock("../../src/config/db", () => ({
  prisma: {
    product: { findMany: jest.fn() },
    category: { findFirst: jest.fn() },
    categoryVariantOption: { findMany: jest.fn() },
    productVariant: { createMany: jest.fn() },
    branch: { findMany: jest.fn(), findFirst: jest.fn() },
    productStock: { findFirst: jest.fn(), updateMany: jest.fn(), create: jest.fn(), findMany: jest.fn() },
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
  syncHqStock: jest.fn(),
  canEditBranchStock: jest.fn().mockReturnValue(true),
  getStockSummary: jest.fn().mockResolvedValue({ total: 0, branches: [] }),
}));

const mockedPrisma = prisma as unknown as {
  product: { findMany: jest.Mock };
  branch: { findMany: jest.Mock; findFirst: jest.Mock };
  productStock: { findFirst: jest.Mock; updateMany: jest.Mock; create: jest.Mock; findMany: jest.Mock };
  category: { findFirst: jest.Mock };
  categoryVariantOption: { findMany: jest.Mock };
  productVariant: { createMany: jest.Mock };
  $transaction: jest.Mock;
};

const mockResponse = () => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("productController.getProducts — branchId filter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("adds stocks include with branchId filter when branchId is provided", async () => {
    mockedPrisma.product.findMany.mockResolvedValue([
      { id: "p-1", name: "Stocked Product", stocks: [{ quantity: 5 }] },
    ]);

    const req = { query: { branchId: "br-1" } } as unknown as Request;
    const res = mockResponse();

    await productController.getProducts(req, res);

    expect(mockedPrisma.product.findMany).toHaveBeenCalledTimes(1);
    const callArgs = mockedPrisma.product.findMany.mock.calls[0][0];
    // where.stocks should NOT be used anymore (we use include.stocks instead)
    expect(callArgs.where?.stocks).toBeUndefined();
    // include.stocks should filter by branchId and select only quantity
    expect(callArgs.include.stocks).toEqual({
      where: { branchId: "br-1" },
      select: { quantity: true },
    });
  });

  it("omits stocks include when branchId is not provided (org-wide, backward-compat)", async () => {
    mockedPrisma.product.findMany.mockResolvedValue([
      { id: "p-1", name: "Any Product" },
    ]);

    const req = { query: {} } as unknown as Request;
    const res = mockResponse();

    await productController.getProducts(req, res);

    expect(mockedPrisma.product.findMany).toHaveBeenCalledTimes(1);
    const callArgs = mockedPrisma.product.findMany.mock.calls[0][0];
    expect(callArgs.where?.stocks).toBeUndefined();
    expect(callArgs.include.stocks).toBeUndefined();
  });

  it("merges stocks include with existing name filter when branchId is provided", async () => {
    mockedPrisma.product.findMany.mockResolvedValue([]);

    const req = {
      query: { branchId: "br-2", name: "Zap" },
    } as unknown as Request;
    const res = mockResponse();

    await productController.getProducts(req, res);

    const callArgs = mockedPrisma.product.findMany.mock.calls[0][0];
    // stocks should be in include, not in where
    expect(callArgs.include.stocks).toEqual({
      where: { branchId: "br-2" },
      select: { quantity: true },
    });
    // Name filter should still be in where
    expect(callArgs.where.OR).toBeDefined();
    expect(callArgs.where.OR[0].name.contains).toBe("Zap");
  });
});

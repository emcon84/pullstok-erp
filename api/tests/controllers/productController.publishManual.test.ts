import { Request, Response } from "express";
import productController from "../../src/controllers/productController";
import { prisma, basePrisma } from "../../src/config/db";

jest.mock("../../src/config/db", () => ({
  prisma: {
    product: {
      updateMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
    },
  },
  basePrisma: {
    organization: { findUniqueOrThrow: jest.fn() },
  },
}));

jest.mock("../../src/config/tenantContext", () => ({
  requireOrganizationId: jest.fn().mockReturnValue("org-1"),
}));

jest.mock("../../src/services/priceLooseService", () => ({
  recomputeForProduct: jest.fn(),
  recomputeForBulkPriceUpdate: jest.fn(),
  recomputeForCsvImport: jest.fn(),
}));

jest.mock("../../src/services/stockService", () => ({
  syncHqStock: jest.fn(),
  canEditBranchStock: jest.fn(),
  getStockSummary: jest.fn(),
}));

jest.mock("../../src/realtime/socket", () => ({
  emitProductChanged: jest.fn(),
}));

const mockedPrisma = prisma as unknown as {
  product: { updateMany: jest.Mock; findFirst: jest.Mock; count: jest.Mock };
};
const mockedBasePrisma = basePrisma as unknown as {
  organization: { findUniqueOrThrow: jest.Mock };
};

const mockResponse = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
};

// Un producto manual (isManual=true) nunca debe poder publicarse en la tienda.
describe("productController — publicar no alcanza productos manuales", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedPrisma.product.updateMany.mockResolvedValue({ count: 1 });
    mockedPrisma.product.findFirst.mockResolvedValue({ id: "p1" });
    mockedBasePrisma.organization.findUniqueOrThrow.mockResolvedValue({ plan: "PREMIUM" });
  });

  it("publishProduct(true) agrega isManual: false al where (manual → 404)", async () => {
    await productController.publishProduct(
      { params: { id: "p1" }, body: { publishedToStore: true } } as unknown as Request,
      mockResponse(),
    );

    expect(mockedPrisma.product.updateMany).toHaveBeenCalledWith({
      where: { id: "p1", isManual: false },
      data: { publishedToStore: true },
    });
  });

  it("publishProduct(false) despublica sin restricción (idempotente para manuales)", async () => {
    await productController.publishProduct(
      { params: { id: "p1" }, body: { publishedToStore: false } } as unknown as Request,
      mockResponse(),
    );

    expect(mockedPrisma.product.updateMany).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { publishedToStore: false },
    });
  });

  it("bulkPublish(true) excluye productos manuales del where", async () => {
    mockedPrisma.product.updateMany.mockResolvedValue({ count: 3 });

    await productController.bulkPublish(
      { body: { brandValues: ["Royal Canin"], publishedToStore: true } } as Request,
      mockResponse(),
    );

    const where = mockedPrisma.product.updateMany.mock.calls[0][0].where;
    expect(where.isManual).toBe(false);
  });

  it("bulkPublish(false) no agrega el filtro isManual", async () => {
    await productController.bulkPublish(
      { body: { brandValues: ["Royal Canin"], publishedToStore: false } } as Request,
      mockResponse(),
    );

    const where = mockedPrisma.product.updateMany.mock.calls[0][0].where;
    expect(where).not.toHaveProperty("isManual");
  });
});

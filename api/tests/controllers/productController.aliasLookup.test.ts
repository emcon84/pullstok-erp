import { Request, Response } from "express";
import { prisma } from "../../src/config/db";
import { getProductByCode, getProductByScan } from "../../src/controllers/productController";

jest.mock("../../src/config/db", () => ({
  prisma: {
    product: { findFirst: jest.fn() },
    category: { findMany: jest.fn() },
    priceKgBrand: { findMany: jest.fn() },
    priceKgType: { findMany: jest.fn() },
    priceKgPrice: { findMany: jest.fn(), findFirst: jest.fn() },
  },
  basePrisma: {},
}));

jest.mock("../../src/config/tenantContext", () => ({
  requireOrganizationId: jest.fn().mockReturnValue("org-1"),
}));

const db = prisma as unknown as { product: { findFirst: jest.Mock } };

const req = (params: any) => ({ params } as unknown as Request);
const mockRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
};

describe("alias barcode lookups", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.product.findFirst.mockResolvedValue(null);
  });

  it("getProductByCode also matches an alias code and includes aliases", async () => {
    await getProductByCode(req({ code: "ALT-1" }), mockRes());
    const args = db.product.findFirst.mock.calls[0][0];
    expect(args.where.OR).toEqual([
      { code: "ALT-1" },
      { barcode: "ALT-1" },
      { barcodes: { some: { code: "ALT-1" } } },
    ]);
    expect(args.include.barcodes).toEqual({ select: { id: true, code: true } });
  });

  it("getProductByScan also matches an alias code and includes aliases", async () => {
    await getProductByScan(req({ barcode: "ALT-1" }), mockRes());
    const args = db.product.findFirst.mock.calls[0][0];
    expect(args.where.OR).toEqual([
      { code: "ALT-1" },
      { barcode: "ALT-1" },
      { barcodes: { some: { code: "ALT-1" } } },
    ]);
    expect(args.include.barcodes).toEqual({ select: { id: true, code: true } });
  });
});

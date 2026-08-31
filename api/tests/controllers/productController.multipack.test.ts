/**
 * Tests de mapProduct (sdd/venta-por-unidad-multpack, task 2.1): el payload de
 * GET /products debe exponer `unitsPerBox` y el `perUnitPrice` derivado
 * (round2(price/unitsPerBox)); null si el producto no es vendible por unidad.
 * Sin DB: findMany mockeado.
 */
import { Request, Response } from "express";
import productController from "../../src/controllers/productController";
import { prisma } from "../../src/config/db";

jest.mock("../../src/config/db", () => ({
  prisma: {
    product: { findMany: jest.fn(), count: jest.fn() },
    category: { findFirst: jest.fn(), findMany: jest.fn() },
    categoryVariantOption: { findMany: jest.fn() },
    productVariant: { createMany: jest.fn(), deleteMany: jest.fn() },
    branch: { findMany: jest.fn(), findFirst: jest.fn() },
    productStock: { findFirst: jest.fn(), updateMany: jest.fn(), create: jest.fn(), findMany: jest.fn() },
    priceListEntry: { findMany: jest.fn() },
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

const mockedPrisma = prisma as unknown as {
  product: { findMany: jest.Mock; count: jest.Mock };
};

const query = (q: Record<string, unknown> = {}) => ({ query: q } as unknown as Request);
const mockResponse = () => {
  const res = {} as Response & { json: jest.Mock; status: jest.Mock };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("productController.getProducts — mapProduct unitsPerBox/perUnitPrice", () => {
  beforeEach(() => jest.clearAllMocks());

  it("expone unitsPerBox y perUnitPrice derivado para un multi-pack vendible", async () => {
    mockedPrisma.product.findMany.mockResolvedValue([
      {
        id: "p-1",
        name: "FELIX X 15x85grs",
        price: 18400,
        unitsPerBox: 15,
        priceListEntries: [],
      },
    ]);

    const res = mockResponse();
    await productController.getProducts(query(), res);

    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body[0].unitsPerBox).toBe(15);
    expect(body[0].perUnitPrice).toBe(1226.67); // round2(18400/15)
  });

  it("deja unitsPerBox y perUnitPrice en null para un producto box-only", async () => {
    mockedPrisma.product.findMany.mockResolvedValue([
      {
        id: "p-2",
        name: "PURINA GATO ADULTO X 15 KG",
        price: 30000,
        unitsPerBox: null,
        priceListEntries: [],
      },
    ]);

    const res = mockResponse();
    await productController.getProducts(query(), res);

    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body[0].unitsPerBox).toBeNull();
    expect(body[0].perUnitPrice).toBeNull();
  });

  it("expone perUnitPrice también en la rama paginada (page/pageSize)", async () => {
    mockedPrisma.product.findMany.mockResolvedValue([
      {
        id: "p-1",
        name: "FELIX X 15x85grs",
        price: 18400,
        unitsPerBox: 15,
        priceListEntries: [],
      },
    ]);
    mockedPrisma.product.count.mockResolvedValue(1);

    const res = mockResponse();
    await productController.getProducts(query({ page: "1", pageSize: "30" }), res);

    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.items[0].perUnitPrice).toBe(1226.67);
  });
});

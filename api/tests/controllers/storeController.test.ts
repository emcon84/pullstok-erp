import { Request, Response } from "express";
import { prisma, basePrisma } from "../../src/config/db";
import storeController from "../../src/controllers/storeController";

// Mocks: config/db (prisma + basePrisma) y tenantContext (org fija). El resto
// de los imports de storeController (secuenceService/mail/socket) no tienen
// side effects de import y no se ejercitan en estas unidades (checkout se
// verifica por e2e — mockear la tx SERIALIZABLE exigiría 8+ mocks).
jest.mock("../../src/config/db", () => ({
  prisma: {
    product: { findMany: jest.fn(), findFirst: jest.fn() },
    branch: { findFirst: jest.fn() },
    productStock: { findMany: jest.fn() },
  },
  basePrisma: {
    storeSettings: { findFirst: jest.fn() },
  },
}));

jest.mock("../../src/config/tenantContext", () => ({
  requireOrganizationId: jest.fn().mockReturnValue("org-1"),
}));

const mockedPrisma = prisma as unknown as {
  product: { findMany: jest.Mock; findFirst: jest.Mock };
  branch: { findFirst: jest.Mock };
  productStock: { findMany: jest.Mock };
};
const mockedBasePrisma = basePrisma as unknown as {
  storeSettings: { findFirst: jest.Mock };
};

const mockRequest = (params?: any) =>
  ({ params, query: {} } as unknown as Request);
const mockResponse = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

// Producto base del catálogo: legacy quantity=10 (NO debe usarse — la fuente
// es ProductStock de la sucursal efectiva, spec S1/D7).
const catalogProduct = {
  id: "prod-1",
  name: "Prod A",
  price: 100,
  description: null,
  image: null,
  quantity: 10,
};

describe("storeController.getProducts (S1)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("quantity = ProductStock de la sucursal configurada (storeBranchId=b-2, stock=3)", async () => {
    mockedPrisma.product.findMany.mockResolvedValue([catalogProduct]);
    mockedBasePrisma.storeSettings.findFirst.mockResolvedValue({
      storeBranchId: "b-2",
    });
    mockedPrisma.branch.findFirst.mockResolvedValue({ id: "b-hq" });
    mockedPrisma.productStock.findMany.mockResolvedValue([
      { productId: "prod-1", quantity: 3 },
    ]);

    const res = mockResponse();
    await storeController.getProducts(mockRequest(), res);

    // 1 solo findMany de ProductStock para toda la página (sin N+1, design D7),
    // scopeado a la sucursal efectiva.
    expect(mockedPrisma.productStock.findMany).toHaveBeenCalledWith({
      where: { branchId: "b-2", productId: { in: ["prod-1"] } },
      select: { productId: true, quantity: true },
    });
    const payload = res.json.mock.calls[0][0];
    expect(payload).toEqual([{ ...catalogProduct, quantity: 3 }]);
  });

  it("sin storeBranchId → fallback a la casa central (stock HQ=10)", async () => {
    mockedPrisma.product.findMany.mockResolvedValue([catalogProduct]);
    mockedBasePrisma.storeSettings.findFirst.mockResolvedValue(null);
    mockedPrisma.branch.findFirst.mockResolvedValue({ id: "b-hq" });
    mockedPrisma.productStock.findMany.mockResolvedValue([
      { productId: "prod-1", quantity: 10 },
    ]);

    const res = mockResponse();
    await storeController.getProducts(mockRequest(), res);

    expect(mockedPrisma.productStock.findMany).toHaveBeenCalledWith({
      where: { branchId: "b-hq", productId: { in: ["prod-1"] } },
      select: { productId: true, quantity: true },
    });
    const payload = res.json.mock.calls[0][0];
    expect(payload[0].quantity).toBe(10);
  });

  it("sin storeBranchId ni HQ → quantity 0 y NO consulta ProductStock (sin sucursal efectiva)", async () => {
    mockedPrisma.product.findMany.mockResolvedValue([catalogProduct]);
    mockedBasePrisma.storeSettings.findFirst.mockResolvedValue(null);
    mockedPrisma.branch.findFirst.mockResolvedValue(null);

    const res = mockResponse();
    await storeController.getProducts(mockRequest(), res);

    expect(mockedPrisma.productStock.findMany).not.toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload[0].quantity).toBe(0);
  });
});

describe("storeController.getProductById (S1)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("quantity del ProductStock de la sucursal efectiva en el detalle", async () => {
    mockedPrisma.product.findFirst.mockResolvedValue(catalogProduct);
    mockedBasePrisma.storeSettings.findFirst.mockResolvedValue({
      storeBranchId: "b-2",
    });
    mockedPrisma.branch.findFirst.mockResolvedValue({ id: "b-hq" });
    mockedPrisma.productStock.findMany.mockResolvedValue([
      { productId: "prod-1", quantity: 3 },
    ]);

    const res = mockResponse();
    await storeController.getProductById(mockRequest({ id: "prod-1" }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0]).toEqual({
      ...catalogProduct,
      quantity: 3,
    });
  });

  it("404 cuando el producto no existe o no está publicado (criterio sin cambios)", async () => {
    mockedPrisma.product.findFirst.mockResolvedValue(null);

    const res = mockResponse();
    await storeController.getProductById(mockRequest({ id: "nope" }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockedPrisma.productStock.findMany).not.toHaveBeenCalled();
  });
});

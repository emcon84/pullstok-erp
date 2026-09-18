import { Request, Response } from "express";
import { prisma } from "../../src/config/db";
import productController from "../../src/controllers/productController";

// Mocks: config/db (prisma) y tenantContext (org fija) — mismo patrón que
// branchStockController.test.ts.
jest.mock("../../src/config/db", () => ({
  prisma: {
    product: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    category: { findMany: jest.fn() },
  },
}));

jest.mock("../../src/config/tenantContext", () => ({
  requireOrganizationId: jest.fn().mockReturnValue("org-1"),
}));

const mockedPrisma = prisma as unknown as {
  product: { findFirst: jest.Mock; findMany: jest.Mock; update: jest.Mock };
  category: { findMany: jest.Mock };
};

const mockRequest = (params: any, user?: any, body?: any) =>
  ({ params, user, body } as unknown as Request);
const mockResponse = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("productController.generateProductBarcode", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("404 si el producto no existe en la org", async () => {
    mockedPrisma.product.findFirst.mockResolvedValue(null);

    const req = mockRequest({ id: "prod-otra-org" });
    const res = mockResponse();

    await productController.generateProductBarcode(req as any, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: "Producto no encontrado" });
    expect(mockedPrisma.product.update).not.toHaveBeenCalled();
  });

  it("409 si el producto ya tiene un código de barras asignado", async () => {
    mockedPrisma.product.findFirst.mockResolvedValue({
      id: "prod-1",
      name: "IBUPIRAC 400",
      barcode: "7791234567890",
    });

    const req = mockRequest({ id: "prod-1" });
    const res = mockResponse();

    await productController.generateProductBarcode(req as any, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      message: "El producto ya tiene un código de barras asignado.",
    });
    expect(mockedPrisma.product.update).not.toHaveBeenCalled();
  });

  it("asigna INT00001 cuando la org no tiene otros barcodes generados", async () => {
    mockedPrisma.product.findFirst.mockResolvedValue({
      id: "prod-1",
      name: "PRODUCTO SIN CODIGO",
      barcode: null,
    });
    mockedPrisma.product.findMany.mockResolvedValue([
      { barcode: null },
      { barcode: "7791234567890" },
    ]);
    mockedPrisma.product.update.mockResolvedValue({});

    const req = mockRequest({ id: "prod-1" });
    const res = mockResponse();

    await productController.generateProductBarcode(req as any, res);

    expect(mockedPrisma.product.update).toHaveBeenCalledWith({
      where: { id: "prod-1" },
      data: { barcode: "INT00001" },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      id: "prod-1",
      name: "PRODUCTO SIN CODIGO",
      barcode: "INT00001",
    });
  });

  it("continúa la secuencia existente de INT##### de la org (ignora BLST de otro prefix)", async () => {
    mockedPrisma.product.findFirst.mockResolvedValue({
      id: "prod-2",
      name: "OTRO PRODUCTO",
      barcode: "",
    });
    mockedPrisma.product.findMany.mockResolvedValue([
      { barcode: "INT00003" },
      { barcode: "BLST00099" },
      { barcode: null },
    ]);
    mockedPrisma.product.update.mockResolvedValue({});

    const req = mockRequest({ id: "prod-2" });
    const res = mockResponse();

    await productController.generateProductBarcode(req as any, res);

    expect(mockedPrisma.product.update).toHaveBeenCalledWith({
      where: { id: "prod-2" },
      data: { barcode: "INT00004" },
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("500 con el mensaje del error si prisma explota", async () => {
    mockedPrisma.product.findFirst.mockRejectedValue(new Error("db down"));

    const req = mockRequest({ id: "prod-1" });
    const res = mockResponse();

    await productController.generateProductBarcode(req as any, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: "db down" });
  });
});

describe("productController.getBarcodesReport", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("200 con total/conBarcode/sinBarcode y categoría resuelta por producto", async () => {
    mockedPrisma.product.findMany.mockResolvedValue([
      { id: "p1", name: "A", code: "A1", barcode: "111", categoryId: "cat-1" },
      { id: "p2", name: "B", code: "B1", barcode: "", categoryId: "cat-2" },
      { id: "p3", name: "C", code: "C1", barcode: null, categoryId: null },
      { id: "p4", name: "D", code: "D1", barcode: "222", categoryId: "cat-missing" },
    ]);
    mockedPrisma.category.findMany.mockResolvedValue([
      { id: "cat-1", name: "Alimento Seco" },
      { id: "cat-2", name: "Accesorios" },
    ]);

    const req = mockRequest({});
    const res = mockResponse();

    await productController.getBarcodesReport(req, res);

    expect(res.json).toHaveBeenCalledWith({
      total: 4,
      conBarcode: 2,
      sinBarcode: 2,
      items: [
        { id: "p1", name: "A", category: "Alimento Seco", code: "A1", barcode: "111", hasBarcode: true },
        { id: "p2", name: "B", category: "Accesorios", code: "B1", barcode: "", hasBarcode: false },
        { id: "p3", name: "C", category: "Sin categoría", code: "C1", barcode: "", hasBarcode: false },
        { id: "p4", name: "D", category: "Sin categoría", code: "D1", barcode: "222", hasBarcode: true },
      ],
    });
  });

  it("500 con mensaje genérico si prisma explota", async () => {
    mockedPrisma.product.findMany.mockRejectedValue(new Error("db down"));

    const req = mockRequest({});
    const res = mockResponse();

    await productController.getBarcodesReport(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

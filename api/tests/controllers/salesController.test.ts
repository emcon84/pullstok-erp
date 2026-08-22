/**
 * Unit tests — salesController.createSale error mapping (sdd/caja-apertura-cierre
 * R7/R9). Verifica que CASH_SESSION_REQUIRED → 422 y PAYMENTS_DO_NOT_MATCH_TOTAL
 * → 400, y que payments/cashSessionId se propagan al service.
 */
import { Request, Response } from "express";
import salesController from "../../src/controllers/salesController";
import SaleService from "../../src/services/salesService";
import { prisma } from "../../src/config/db";

jest.mock("../../src/services/salesService", () => ({
  createSale: jest.fn(),
  getAllSales: jest.fn(),
  getSaleById: jest.fn(),
  deleteSale: jest.fn(),
  __esModule: true,
  default: {
    createSale: jest.fn(),
    getAllSales: jest.fn(),
    getSaleById: jest.fn(),
    deleteSale: jest.fn(),
  },
}));

jest.mock("../../src/config/db", () => ({
  prisma: {
    sale: { findFirst: jest.fn() },
    customer: { findFirst: jest.fn() },
    invoice: { create: jest.fn() },
  },
  basePrisma: {},
}));

jest.mock("../../src/config/tenantContext", () => ({
  requireOrganizationId: jest.fn().mockReturnValue("org-1"),
}));

const service = SaleService as unknown as {
  createSale: jest.Mock;
};

const mockRequest = (body: any = {}) =>
  ({ body, user: { id: "u-1", role: "CASHIER" } } as unknown as Request);

const mockResponse = () => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mkErr = (code: string, message: string) => {
  const e: any = new Error(message);
  e.code = code;
  return e;
};

describe("salesController.createSale", () => {
  beforeEach(() => jest.clearAllMocks());

  it("propagates payments and cashSessionId to the service", async () => {
    service.createSale.mockResolvedValue({ id: "s-1" });
    const req = mockRequest({
      products: [{ productId: "p-1", quantity: 1, price: 100, category: "x" }],
      payments: [{ method: "EFECTIVO", amount: 100 }],
      cashSessionId: "cs-1",
    });
    const res = mockResponse();
    await salesController.createSale(req, res);

    expect(service.createSale).toHaveBeenCalledWith(
      expect.objectContaining({
        payments: [{ method: "EFECTIVO", amount: 100 }],
        cashSessionId: "cs-1",
      }),
      "u-1",
      "CASHIER",
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("maps CASH_SESSION_REQUIRED to 422 (R9)", async () => {
    service.createSale.mockRejectedValue(
      mkErr("CASH_SESSION_REQUIRED", "Necesitás una caja abierta"),
    );
    const req = mockRequest({ products: [] });
    const res = mockResponse();
    await salesController.createSale(req, res);
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "CASH_SESSION_REQUIRED" }),
    );
  });

  it("maps PAYMENTS_DO_NOT_MATCH_TOTAL to 400 (R7)", async () => {
    service.createSale.mockRejectedValue(
      mkErr("PAYMENTS_DO_NOT_MATCH_TOTAL", "Suma no coincide"),
    );
    const req = mockRequest({ products: [] });
    const res = mockResponse();
    await salesController.createSale(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "PAYMENTS_DO_NOT_MATCH_TOTAL" }),
    );
  });
});

describe("salesController.createInvoiceFromSale — propaga branchId (sdd/sucursales-pv-facturacion R4)", () => {
  const mockedPrisma = prisma as unknown as {
    sale: { findFirst: jest.Mock };
    customer: { findFirst: jest.Mock };
    invoice: { create: jest.Mock };
  };

  const mockRequest = (params: any, body: any = {}) =>
    ({ params, body } as unknown as Request);

  const mockResponse = () => {
    const res = {} as Response;
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(() => jest.clearAllMocks());

  it("setea invoice.branchId = sale.branchId y el include agrega branch (R4)", async () => {
    mockedPrisma.sale.findFirst.mockResolvedValue({
      id: "s-1",
      branchId: "b-1",
      invoice: null,
      items: [{
        id: "i-1",
        name: "Producto",
        quantity: 1,
        price: 100,
        category: "cat",
      }],
    });
    mockedPrisma.customer.findFirst.mockResolvedValue({ id: "cust-1" });
    mockedPrisma.invoice.create.mockResolvedValue({
      id: "inv-1",
      branchId: "b-1",
      status: "DRAFT",
    });

    const req = mockRequest({ saleId: "s-1" }, { customerId: "cust-1" });
    const res = mockResponse();

    await salesController.createInvoiceFromSale(req, res);

    expect(mockedPrisma.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ branchId: "b-1" }),
        include: expect.objectContaining({ branch: true }),
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("sale sin branchId → la invoice se crea con branchId null (legacy)", async () => {
    mockedPrisma.sale.findFirst.mockResolvedValue({
      id: "s-2",
      branchId: null,
      invoice: null,
      items: [{ id: "i-2", name: "Prod", quantity: 1, price: 50, category: "c" }],
    });
    mockedPrisma.customer.findFirst.mockResolvedValue({ id: "cust-1" });
    mockedPrisma.invoice.create.mockResolvedValue({
      id: "inv-2",
      branchId: null,
      status: "DRAFT",
    });

    const req = mockRequest({ saleId: "s-2" }, { customerId: "cust-1" });
    const res = mockResponse();

    await salesController.createInvoiceFromSale(req, res);

    expect(mockedPrisma.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ branchId: null }),
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

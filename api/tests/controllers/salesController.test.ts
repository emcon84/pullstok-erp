/**
 * Unit tests — salesController.createSale error mapping (sdd/caja-apertura-cierre
 * R7/R9). Verifica que CASH_SESSION_REQUIRED → 422 y PAYMENTS_DO_NOT_MATCH_TOTAL
 * → 400, y que payments/cashSessionId se propagan al service.
 */
import { Request, Response } from "express";
import salesController from "../../src/controllers/salesController";
import SaleService from "../../src/services/salesService";

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
  prisma: {},
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

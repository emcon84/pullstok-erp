/**
 * Unit tests — cashSessionController error mapping (sdd/caja-apertura-cierre).
 * Verifica el mapeo HTTP de los códigos de error del service (R4/R5 + mapeos).
 */
import { Request, Response } from "express";
import cashSessionController from "../../src/controllers/cashSessionController";
import cashSessionService from "../../src/services/cashSessionService";

jest.mock("../../src/services/cashSessionService", () => ({
  openCash: jest.fn(),
  closeCash: jest.fn(),
  getCurrent: jest.fn(),
  getOne: jest.fn(),
  list: jest.fn(),
  __esModule: true,
  default: {
    openCash: jest.fn(),
    closeCash: jest.fn(),
    getCurrent: jest.fn(),
    getOne: jest.fn(),
    list: jest.fn(),
  },
}));

jest.mock("../../src/config/db", () => ({
  prisma: {},
  basePrisma: {},
}));

jest.mock("../../src/config/tenantContext", () => ({
  requireOrganizationId: jest.fn().mockReturnValue("org-1"),
}));

const service = cashSessionService as unknown as {
  openCash: jest.Mock;
  closeCash: jest.Mock;
  getCurrent: jest.Mock;
  getOne: jest.Mock;
  list: jest.Mock;
};

const mockRequest = (body: any = {}, params: any = {}, query: any = {}) =>
  ({ body, params, query, user: { id: "u-1", role: "CASHIER" } } as unknown as Request);

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

describe("cashSessionController.openCashSession", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 201 on success", async () => {
    service.openCash.mockResolvedValue({ id: "cs-1", status: "OPEN" });
    const req = mockRequest({ openingAmount: 5000 });
    const res = mockResponse();
    await cashSessionController.openCashSession(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ id: "cs-1", status: "OPEN" });
  });

  it("maps CASH_SESSION_ALREADY_OPEN to 409", async () => {
    service.openCash.mockRejectedValue(
      mkErr("CASH_SESSION_ALREADY_OPEN", "Ya tenés una caja abierta"),
    );
    const req = mockRequest({});
    const res = mockResponse();
    await cashSessionController.openCashSession(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "CASH_SESSION_ALREADY_OPEN" }),
    );
  });

  it("maps INVALID_BRANCH to 400", async () => {
    service.openCash.mockRejectedValue(
      mkErr("INVALID_BRANCH", "branchId requerido"),
    );
    const req = mockRequest({});
    const res = mockResponse();
    await cashSessionController.openCashSession(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe("cashSessionController.closeCashSession", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 200 with arqueo on success", async () => {
    service.closeCash.mockResolvedValue({
      expectedAmount: 6500,
      closingAmount: 6400,
      difference: -100,
    });
    const req = mockRequest({ closingByMethod: { EFECTIVO: 6400 } }, { id: "cs-1" });
    const res = mockResponse();
    await cashSessionController.closeCashSession(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      expectedAmount: 6500,
      closingAmount: 6400,
      difference: -100,
    });
  });

  it("maps CASH_SESSION_NOT_FOUND to 404", async () => {
    service.closeCash.mockRejectedValue(mkErr("CASH_SESSION_NOT_FOUND", "Caja no encontrada"));
    const req = mockRequest({ closingByMethod: { EFECTIVO: 100 } }, { id: "cs-x" });
    const res = mockResponse();
    await cashSessionController.closeCashSession(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("maps CASH_SESSION_ALREADY_CLOSED to 409", async () => {
    service.closeCash.mockRejectedValue(mkErr("CASH_SESSION_ALREADY_CLOSED", "Ya cerrada"));
    const req = mockRequest({ closingByMethod: { EFECTIVO: 100 } }, { id: "cs-1" });
    const res = mockResponse();
    await cashSessionController.closeCashSession(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("maps FORBIDDEN to 403", async () => {
    service.closeCash.mockRejectedValue(mkErr("FORBIDDEN", "Sin permiso"));
    const req = mockRequest({ closingByMethod: { EFECTIVO: 100 } }, { id: "cs-1" });
    const res = mockResponse();
    await cashSessionController.closeCashSession(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe("cashSessionController.getCurrentCashSession", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 200 with the current session", async () => {
    service.getCurrent.mockResolvedValue({ id: "cs-1", status: "OPEN" });
    const req = mockRequest({}, {}, {});
    const res = mockResponse();
    await cashSessionController.getCurrentCashSession(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ id: "cs-1", status: "OPEN" });
  });
});

describe("cashSessionController.getCashSession", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 200 with the session detail", async () => {
    service.getOne.mockResolvedValue({ id: "cs-1", payments: [] });
    const req = mockRequest({}, { id: "cs-1" });
    const res = mockResponse();
    await cashSessionController.getCashSession(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ id: "cs-1", payments: [] });
  });

  it("maps CASH_SESSION_NOT_FOUND to 404", async () => {
    service.getOne.mockRejectedValue(mkErr("CASH_SESSION_NOT_FOUND", "Caja no encontrada"));
    const req = mockRequest({}, { id: "cs-x" });
    const res = mockResponse();
    await cashSessionController.getCashSession(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("cashSessionController.listCashSessions", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 200 with the list", async () => {
    service.list.mockResolvedValue([{ id: "cs-1" }, { id: "cs-2" }]);
    const req = mockRequest({}, {}, {});
    const res = mockResponse();
    await cashSessionController.listCashSessions(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      items: [{ id: "cs-1" }, { id: "cs-2" }],
    });
  });
});

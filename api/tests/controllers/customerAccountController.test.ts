/**
 * Unit tests — customerAccountController (cuenta-corriente T3): controller fino,
 * mapea códigos de dominio a HTTP y delega en customerAccountService.
 */
import { Response } from "express";
import controller from "../../src/controllers/customerAccountController";
import service from "../../src/services/customerAccountService";
import balancesLock from "../../src/services/balancesLockService";

jest.mock("../../src/services/balancesLockService", () => ({
  __esModule: true,
  default: { unlock: jest.fn() },
}));
const lock = balancesLock as unknown as { unlock: jest.Mock };

jest.mock("../../src/services/customerAccountService", () => ({
  __esModule: true,
  default: {
    getBalances: jest.fn(),
    getBalancesSummary: jest.fn(),
    getAccount: jest.fn(),
    registerPayment: jest.fn(),
    registerHistoricalCharge: jest.fn(),
    updateMovement: jest.fn(),
    deleteMovement: jest.fn(),
    sendAccountStatementWhatsapp: jest.fn(),
    getAccountStatementLink: jest.fn(),
  },
}));

const svc = service as unknown as {
  getBalances: jest.Mock;
  getBalancesSummary: jest.Mock;
  getAccount: jest.Mock;
  registerPayment: jest.Mock;
  registerHistoricalCharge: jest.Mock;
  updateMovement: jest.Mock;
  deleteMovement: jest.Mock;
  sendAccountStatementWhatsapp: jest.Mock;
  getAccountStatementLink: jest.Mock;
};

const mockReq = (params: any = {}, body: any = {}) =>
  ({ params, body, user: { id: "u-1", role: "CASHIER" } }) as any;

const mockRes = () => {
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

describe("customerAccountController", () => {
  beforeEach(() => jest.clearAllMocks());

  it("getBalances: 200 with the service result", async () => {
    svc.getBalances.mockResolvedValue([{ customerId: "c-1", name: "Ana", balance: 10 }]);
    const res = mockRes();
    await controller.getBalances(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith([{ customerId: "c-1", name: "Ana", balance: 10 }]);
  });

  it("getAccount: passes the id param; CUSTOMER_NOT_FOUND → 404", async () => {
    svc.getAccount.mockRejectedValue(mkErr("CUSTOMER_NOT_FOUND", "Cliente no encontrado"));
    const res = mockRes();
    await controller.getAccount(mockReq({ id: "c-x" }), res);
    expect(svc.getAccount).toHaveBeenCalledWith("c-x");
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("registerPayment: 201 and forwards id, body and the user id", async () => {
    svc.registerPayment.mockResolvedValue({ movement: { id: "m-1" }, balance: 5 });
    const res = mockRes();
    const body = { amount: 10, method: "QR" };
    await controller.registerPayment(mockReq({ id: "c-1" }, body), res);
    expect(svc.registerPayment).toHaveBeenCalledWith("c-1", body, "u-1");
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ movement: { id: "m-1" }, balance: 5 });
  });

  it.each([
    ["CUSTOMER_NOT_FOUND", 404],
    ["INVALID_PAYMENT_METHOD", 400],
    ["CASH_SESSION_REQUIRED", 422],
  ])("registerPayment maps %s → %i", async (code, status) => {
    svc.registerPayment.mockRejectedValue(mkErr(code, "msg"));
    const res = mockRes();
    await controller.registerPayment(mockReq({ id: "c-1" }, {}), res);
    expect(res.status).toHaveBeenCalledWith(status);
    expect(res.json).toHaveBeenCalledWith({ error: code, message: "msg" });
  });

  it("registerHistoricalCharge: 201 and forwards id, body and the user id", async () => {
    svc.registerHistoricalCharge.mockResolvedValue({ movement: { id: "m-9" }, balance: 800 });
    const res = mockRes();
    const body = { amount: 800, note: "ventas 2025" };
    await controller.registerHistoricalCharge(mockReq({ id: "c-1" }, body), res);
    expect(svc.registerHistoricalCharge).toHaveBeenCalledWith("c-1", body, "u-1");
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ movement: { id: "m-9" }, balance: 800 });
  });

  it("registerHistoricalCharge maps CUSTOMER_NOT_FOUND → 404", async () => {
    svc.registerHistoricalCharge.mockRejectedValue(mkErr("CUSTOMER_NOT_FOUND", "msg"));
    const res = mockRes();
    await controller.registerHistoricalCharge(mockReq({ id: "c-x" }, { amount: 1 }), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "CUSTOMER_NOT_FOUND", message: "msg" });
  });

  it("updateMovement: 200, forwards ids and body", async () => {
    svc.updateMovement.mockResolvedValue({ movement: { id: "m-1" }, balance: 7 });
    const res = mockRes();
    const body = { amount: 5 };
    await controller.updateMovement(mockReq({ id: "c-1", movementId: "m-1" }, body), res);
    expect(svc.updateMovement).toHaveBeenCalledWith("c-1", "m-1", body);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ movement: { id: "m-1" }, balance: 7 });
  });

  it("deleteMovement: 200, forwards ids and user", async () => {
    svc.deleteMovement.mockResolvedValue({ deletedId: "m-1", balance: 7 });
    const res = mockRes();
    await controller.deleteMovement(mockReq({ id: "c-1", movementId: "m-1" }), res);
    expect(svc.deleteMovement).toHaveBeenCalledWith("c-1", "m-1", "u-1");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ deletedId: "m-1", balance: 7 });
  });

  it.each([
    ["CUSTOMER_NOT_FOUND", 404],
    ["MOVEMENT_NOT_FOUND", 404],
    ["MOVEMENT_IMMUTABLE", 422],
    ["CASH_SESSION_CLOSED", 422],
  ])("update/deleteMovement map %s → %i", async (code, status) => {
    svc.updateMovement.mockRejectedValue(mkErr(code, "msg"));
    svc.deleteMovement.mockRejectedValue(mkErr(code, "msg"));
    for (const fn of [controller.updateMovement, controller.deleteMovement]) {
      const res = mockRes();
      await fn(mockReq({ id: "c-1", movementId: "m-1" }, {}), res);
      expect(res.status).toHaveBeenCalledWith(status);
      expect(res.json).toHaveBeenCalledWith({ error: code, message: "msg" });
    }
  });

  it("unexpected errors → 500", async () => {
    svc.getBalances.mockRejectedValue(new Error("boom"));
    const res = mockRes();
    await controller.getBalances(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it("sendAccountStatementWhatsapp: 200 with { sent: true }, passing the id param", async () => {
    svc.sendAccountStatementWhatsapp.mockResolvedValue({ sent: true });
    const res = mockRes();
    await controller.sendAccountStatementWhatsapp(mockReq({ id: "c-1" }), res);
    expect(svc.sendAccountStatementWhatsapp).toHaveBeenCalledWith("c-1");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ sent: true });
  });

  it.each([
    ["CUSTOMER_NOT_FOUND", 404],
    ["CUSTOMER_PHONE_REQUIRED", 422],
    ["WHATSAPP_SEND_FAILED", 502],
  ])("sendAccountStatementWhatsapp maps %s → %i", async (code, status) => {
    svc.sendAccountStatementWhatsapp.mockRejectedValue(mkErr(code, "msg"));
    const res = mockRes();
    await controller.sendAccountStatementWhatsapp(mockReq({ id: "c-1" }), res);
    expect(res.status).toHaveBeenCalledWith(status);
    expect(res.json).toHaveBeenCalledWith({ error: code, message: "msg" });
  });

  // wa.me fallback (T4): only builds+uploads the PDF, no phone/Kapso involved.
  it("getAccountStatementLink: 200 with the service result, passing the id param", async () => {
    svc.getAccountStatementLink.mockResolvedValue({
      url: "https://r2.example.com/x.pdf",
      filename: "estado-cuenta-Ana.pdf",
    });
    const res = mockRes();
    await controller.getAccountStatementLink(mockReq({ id: "c-1" }), res);
    expect(svc.getAccountStatementLink).toHaveBeenCalledWith("c-1");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      url: "https://r2.example.com/x.pdf",
      filename: "estado-cuenta-Ana.pdf",
    });
  });

  it("getAccountStatementLink: CUSTOMER_NOT_FOUND → 404", async () => {
    svc.getAccountStatementLink.mockRejectedValue(mkErr("CUSTOMER_NOT_FOUND", "Cliente no encontrado"));
    const res = mockRes();
    await controller.getAccountStatementLink(mockReq({ id: "c-x" }), res);
    expect(svc.getAccountStatementLink).toHaveBeenCalledWith("c-x");
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("getAccountStatementLink: unexpected error → 500", async () => {
    svc.getAccountStatementLink.mockRejectedValue(new Error("boom"));
    const res = mockRes();
    await controller.getAccountStatementLink(mockReq({ id: "c-1" }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  describe("balances lock", () => {
    const authedReq = (body: any = {}) =>
      ({ params: {}, body, user: { id: "u-1", role: "ADMIN", organizationId: "org-1" } }) as any;

    it("unlockBalances: 200 with token and expiresInSec", async () => {
      lock.unlock.mockReturnValue({ token: "tok", expiresInSec: 900 });
      const res = mockRes();
      await controller.unlockBalances(authedReq({ password: "pw" }), res);
      expect(lock.unlock).toHaveBeenCalledWith({ userId: "u-1", organizationId: "org-1" }, "pw");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ token: "tok", expiresInSec: 900 });
    });

    it.each([
      ["INVALID_BALANCES_PASSWORD", 401],
      ["BALANCES_RATE_LIMITED", 429],
      ["BALANCES_LOCK_NOT_CONFIGURED", 503],
      ["BALANCES_LOCKED", 403],
    ])("unlockBalances: %s -> %i", async (code, status) => {
      lock.unlock.mockImplementation(() => {
        throw mkErr(code, "msg");
      });
      const res = mockRes();
      await controller.unlockBalances(authedReq({ password: "pw" }), res);
      expect(res.status).toHaveBeenCalledWith(status);
      expect(res.json).toHaveBeenCalledWith({ error: code, message: "msg" });
    });

    it("unlockBalances never echoes the password back", async () => {
      lock.unlock.mockImplementation(() => {
        throw mkErr("INVALID_BALANCES_PASSWORD", "Contraseña incorrecta");
      });
      const res = mockRes();
      await controller.unlockBalances(authedReq({ password: "hunter2" }), res);
      expect(JSON.stringify((res.json as jest.Mock).mock.calls)).not.toContain("hunter2");
    });

    it("getBalancesSummary: 200 with the service result", async () => {
      svc.getBalancesSummary.mockResolvedValue({ totalOwed: 10 });
      const res = mockRes();
      await controller.getBalancesSummary(authedReq(), res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ totalOwed: 10 });
    });
  });
});

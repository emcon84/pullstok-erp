/**
 * Unit tests — customerAccountController (cuenta-corriente T3): controller fino,
 * mapea códigos de dominio a HTTP y delega en customerAccountService.
 */
import { Response } from "express";
import controller from "../../src/controllers/customerAccountController";
import service from "../../src/services/customerAccountService";

jest.mock("../../src/services/customerAccountService", () => ({
  __esModule: true,
  default: {
    getBalances: jest.fn(),
    getAccount: jest.fn(),
    registerPayment: jest.fn(),
    registerHistoricalCharge: jest.fn(),
    sendAccountStatementWhatsapp: jest.fn(),
    getAccountStatementLink: jest.fn(),
  },
}));

const svc = service as unknown as {
  getBalances: jest.Mock;
  getAccount: jest.Mock;
  registerPayment: jest.Mock;
  registerHistoricalCharge: jest.Mock;
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
    ["PAYMENT_EXCEEDS_BALANCE", 400],
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
});

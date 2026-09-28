import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGet, mockPost } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
}));

vi.mock("axios", () => ({
  default: {
    get: mockGet,
    post: mockPost,
    isAxiosError: (e: unknown) => !!(e as { isAxiosError?: boolean })?.isAxiosError,
  },
}));

import {
  getCustomerBalances,
  getCustomerAccount,
  registerAccountPayment,
  getAccountStatementLink,
} from "../services/customerAccountService";

const axiosError = (data: unknown) => ({ isAxiosError: true, response: { data } });

describe("customerAccountService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem("token", "tok-1");
  });

  it("getCustomerBalances GETs /customers/balances with the Bearer token", async () => {
    mockGet.mockResolvedValue({ data: [{ customerId: "c-1", name: "Ana", balance: 100 }] });

    const res = await getCustomerBalances();

    expect(mockGet).toHaveBeenCalledWith(
      expect.stringMatching(/\/customers\/balances$/),
      { headers: { Authorization: "Bearer tok-1" } },
    );
    expect(res).toEqual([{ customerId: "c-1", name: "Ana", balance: 100 }]);
  });

  it("getCustomerAccount GETs /customers/:id/account", async () => {
    const account = { customer: { id: "c-1", name: "Ana" }, balance: 0, movements: [] };
    mockGet.mockResolvedValue({ data: account });

    const res = await getCustomerAccount("c-1");

    expect(mockGet).toHaveBeenCalledWith(
      expect.stringMatching(/\/customers\/c-1\/account$/),
      { headers: { Authorization: "Bearer tok-1" } },
    );
    expect(res).toBe(account);
  });

  it("registerAccountPayment POSTs the cobranza to /customers/:id/account/payments", async () => {
    mockPost.mockResolvedValue({ data: { movement: { id: "m-1" }, balance: 50 } });
    const input = { amount: 50, method: "EFECTIVO" as const, cashSessionId: "cs-1", note: "x" };

    const res = await registerAccountPayment("c-1", input);

    expect(mockPost).toHaveBeenCalledWith(
      expect.stringMatching(/\/customers\/c-1\/account\/payments$/),
      input,
      { headers: { Authorization: "Bearer tok-1" } },
    );
    expect(res.balance).toBe(50);
  });

  it("throws an Error carrying the server message", async () => {
    mockPost.mockRejectedValue(
      axiosError({ error: "PAYMENT_EXCEEDS_BALANCE", message: "El monto supera el saldo adeudado ($10.00)" }),
    );

    await expect(
      registerAccountPayment("c-1", { amount: 99, method: "QR" }),
    ).rejects.toThrow("El monto supera el saldo adeudado ($10.00)");
  });

  it("falls back to a generic message for non-HTTP errors", async () => {
    mockGet.mockRejectedValue(new Error("boom"));
    await expect(getCustomerBalances()).rejects.toThrow("Error al obtener los saldos");
  });

  // wa.me fallback (T4): builds the PDF server-side and returns its URL — no
  // phone required, Kapso not involved.
  it("getAccountStatementLink POSTs to /customers/:id/account/statement-link", async () => {
    mockPost.mockResolvedValue({
      data: { url: "https://r2.example.com/x.pdf", filename: "estado-cuenta-Ana.pdf" },
    });

    const res = await getAccountStatementLink("c-1");

    expect(mockPost).toHaveBeenCalledWith(
      expect.stringMatching(/\/customers\/c-1\/account\/statement-link$/),
      undefined,
      { headers: { Authorization: "Bearer tok-1" } },
    );
    expect(res).toEqual({ url: "https://r2.example.com/x.pdf", filename: "estado-cuenta-Ana.pdf" });
  });

  it("getAccountStatementLink throws an Error carrying the server message", async () => {
    mockPost.mockRejectedValue(axiosError({ error: "CUSTOMER_NOT_FOUND", message: "Cliente no encontrado" }));
    await expect(getAccountStatementLink("nope")).rejects.toThrow("Cliente no encontrado");
  });
});

/**
 * Unit tests — customerAccountService (cuenta-corriente T3).
 * Saldo = Σ CHARGE − Σ PAYMENT por agregación; cobranza con validaciones
 * (sobrepago, cliente de la org, caja abierta si es EFECTIVO) dentro de una
 * transacción que re-chequea el saldo.
 */
import customerAccountService from "../../src/services/customerAccountService";
import { prisma } from "../../src/config/db";

jest.mock("../../src/config/db", () => ({
  prisma: {
    customer: { findFirst: jest.fn(), findMany: jest.fn() },
    cashSession: { findFirst: jest.fn() },
    customerAccountMovement: { findMany: jest.fn(), groupBy: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock("../../src/config/tenantContext", () => ({
  requireOrganizationId: jest.fn().mockReturnValue("org-1"),
}));

const p = prisma as unknown as {
  customer: { findFirst: jest.Mock; findMany: jest.Mock };
  cashSession: { findFirst: jest.Mock };
  customerAccountMovement: { findMany: jest.Mock; groupBy: jest.Mock };
  $transaction: jest.Mock;
};

const makeTx = () => ({
  $queryRaw: jest.fn().mockResolvedValue([]),
  customerAccountMovement: { groupBy: jest.fn(), create: jest.fn() },
});

const sums = (charge: number | null, payment: number | null) => [
  ...(charge === null ? [] : [{ type: "CHARGE", _sum: { amount: charge } }]),
  ...(payment === null ? [] : [{ type: "PAYMENT", _sum: { amount: payment } }]),
];

describe("customerAccountService.getBalances", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns only customers with balance != 0 (Σ CHARGE − Σ PAYMENT), scoped to the org", async () => {
    p.customerAccountMovement.groupBy.mockResolvedValue([
      { customerId: "c-1", type: "CHARGE", _sum: { amount: 300 } },
      { customerId: "c-1", type: "PAYMENT", _sum: { amount: 100 } },
      { customerId: "c-2", type: "CHARGE", _sum: { amount: 50 } },
      { customerId: "c-2", type: "PAYMENT", _sum: { amount: 50 } }, // saldado
      { customerId: "c-3", type: "PAYMENT", _sum: { amount: 20 } }, // a favor
    ]);
    p.customer.findMany.mockResolvedValue([
      { id: "c-1", name: "Ana" },
      { id: "c-3", name: "Beto" },
    ]);

    const result = await customerAccountService.getBalances();

    expect(p.customerAccountMovement.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ["customerId", "type"],
        where: { organizationId: "org-1" },
      }),
    );
    expect(result).toEqual([
      { customerId: "c-1", name: "Ana", balance: 200 },
      { customerId: "c-3", name: "Beto", balance: -20 },
    ]);
  });

  it("returns [] without querying customers when nobody has movements", async () => {
    p.customerAccountMovement.groupBy.mockResolvedValue([]);
    const result = await customerAccountService.getBalances();
    expect(result).toEqual([]);
    expect(p.customer.findMany).not.toHaveBeenCalled();
  });
});

describe("customerAccountService.getAccount", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns customer, balance and movements newest first with the sale reference", async () => {
    p.customer.findFirst.mockResolvedValue({ id: "c-1", name: "Ana", email: "a@a.com" });
    p.customerAccountMovement.groupBy.mockResolvedValue(sums(300, 100));
    const movements = [
      { id: "m-2", type: "PAYMENT", amount: 100, sale: null },
      {
        id: "m-1",
        type: "CHARGE",
        amount: 300,
        saleId: "s-1",
        sale: { id: "s-1", saleDate: new Date() },
      },
    ];
    p.customerAccountMovement.findMany.mockResolvedValue(movements);

    const result = await customerAccountService.getAccount("c-1");

    expect(p.customerAccountMovement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { customerId: "c-1" },
        orderBy: { createdAt: "desc" },
        include: { sale: { select: { id: true, saleDate: true } } },
      }),
    );
    expect(result).toEqual({
      customer: { id: "c-1", name: "Ana" },
      balance: 200,
      movements,
    });
  });

  it("unknown / other-org customer → CUSTOMER_NOT_FOUND", async () => {
    p.customer.findFirst.mockResolvedValue(null);
    await expect(customerAccountService.getAccount("nope")).rejects.toMatchObject({
      code: "CUSTOMER_NOT_FOUND",
    });
  });
});

describe("customerAccountService.registerPayment", () => {
  let tx: ReturnType<typeof makeTx>;
  beforeEach(() => {
    jest.clearAllMocks();
    tx = makeTx();
    p.$transaction.mockImplementation((cb: any) => cb(tx));
    p.customer.findFirst.mockResolvedValue({ id: "c-1", name: "Ana" });
    tx.customerAccountMovement.groupBy.mockResolvedValue(sums(300, 100)); // saldo 200
    tx.customerAccountMovement.create.mockImplementation(async ({ data }: any) => ({
      id: "m-9",
      ...data,
    }));
  });

  it("TRANSFERENCIA: creates a PAYMENT movement (no cash session) and returns the new balance", async () => {
    const result = await customerAccountService.registerPayment(
      "c-1",
      { amount: 50, method: "TRANSFERENCIA", note: "  ref 123 " },
      "u-1",
    );

    expect(tx.customerAccountMovement.create).toHaveBeenCalledWith({
      data: {
        organizationId: "org-1",
        customerId: "c-1",
        type: "PAYMENT",
        amount: 50,
        method: "TRANSFERENCIA",
        cashSessionId: null,
        note: "ref 123",
        createdById: "u-1",
      },
    });
    expect(result.balance).toBe(150);
    expect(result.movement).toMatchObject({ id: "m-9", type: "PAYMENT" });
    expect(p.cashSession.findFirst).not.toHaveBeenCalled();
  });

  it("re-checks the balance inside the transaction, locking the customer row", async () => {
    await customerAccountService.registerPayment("c-1", { amount: 10, method: "QR" }, "u-1");
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.customerAccountMovement.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { customerId: "c-1", organizationId: "org-1" } }),
    );
  });

  it("paying exactly the balance is allowed (balance becomes 0)", async () => {
    const result = await customerAccountService.registerPayment(
      "c-1",
      { amount: 200, method: "QR" },
      "u-1",
    );
    expect(result.balance).toBe(0);
  });

  it("overpayment → PAYMENT_EXCEEDS_BALANCE, nothing created", async () => {
    await expect(
      customerAccountService.registerPayment("c-1", { amount: 200.01, method: "QR" }, "u-1"),
    ).rejects.toMatchObject({
      code: "PAYMENT_EXCEEDS_BALANCE",
      message: expect.stringContaining("saldo"),
    });
    expect(tx.customerAccountMovement.create).not.toHaveBeenCalled();
  });

  it("customer with no debt cannot receive a payment", async () => {
    tx.customerAccountMovement.groupBy.mockResolvedValue([]);
    await expect(
      customerAccountService.registerPayment("c-1", { amount: 1, method: "QR" }, "u-1"),
    ).rejects.toMatchObject({ code: "PAYMENT_EXCEEDS_BALANCE" });
  });

  it("unknown / other-org customer → CUSTOMER_NOT_FOUND (no transaction)", async () => {
    p.customer.findFirst.mockResolvedValue(null);
    await expect(
      customerAccountService.registerPayment("nope", { amount: 1, method: "QR" }, "u-1"),
    ).rejects.toMatchObject({ code: "CUSTOMER_NOT_FOUND" });
    expect(p.$transaction).not.toHaveBeenCalled();
  });

  it("CUENTA_CORRIENTE is not a valid collection method", async () => {
    await expect(
      customerAccountService.registerPayment(
        "c-1",
        { amount: 1, method: "CUENTA_CORRIENTE" as any },
        "u-1",
      ),
    ).rejects.toMatchObject({ code: "INVALID_PAYMENT_METHOD" });
  });

  it("EFECTIVO without cashSessionId → CASH_SESSION_REQUIRED", async () => {
    await expect(
      customerAccountService.registerPayment("c-1", { amount: 10, method: "EFECTIVO" }, "u-1"),
    ).rejects.toMatchObject({ code: "CASH_SESSION_REQUIRED" });
    expect(tx.customerAccountMovement.create).not.toHaveBeenCalled();
  });

  it("EFECTIVO with a closed / other-org cash session → CASH_SESSION_REQUIRED", async () => {
    p.cashSession.findFirst.mockResolvedValue(null);
    await expect(
      customerAccountService.registerPayment(
        "c-1",
        { amount: 10, method: "EFECTIVO", cashSessionId: "cs-x" },
        "u-1",
      ),
    ).rejects.toMatchObject({ code: "CASH_SESSION_REQUIRED" });
    expect(p.cashSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cs-x", status: "OPEN" } }),
    );
  });

  it("EFECTIVO with an OPEN session stores method + cashSessionId", async () => {
    p.cashSession.findFirst.mockResolvedValue({ id: "cs-1" });
    await customerAccountService.registerPayment(
      "c-1",
      { amount: 80, method: "EFECTIVO", cashSessionId: "cs-1" },
      "u-1",
    );
    expect(tx.customerAccountMovement.create.mock.calls[0][0].data).toMatchObject({
      method: "EFECTIVO",
      cashSessionId: "cs-1",
      amount: 80,
    });
  });

  it("non-cash methods ignore a stray cashSessionId (not stored, not looked up)", async () => {
    await customerAccountService.registerPayment(
      "c-1",
      { amount: 10, method: "TARJETA_DEBITO", cashSessionId: "cs-1" },
      "u-1",
    );
    expect(p.cashSession.findFirst).not.toHaveBeenCalled();
    expect(tx.customerAccountMovement.create.mock.calls[0][0].data.cashSessionId).toBeNull();
  });
});

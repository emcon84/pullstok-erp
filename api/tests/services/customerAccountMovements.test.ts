/**
 * Unit tests — customerAccountService: payment date, updateMovement and
 * deleteMovement (cuenta-corriente edición de movimientos).
 */
import customerAccountService from "../../src/services/customerAccountService";
import { prisma } from "../../src/config/db";

jest.mock("../../src/config/db", () => ({
  prisma: {
    customer: { findFirst: jest.fn(), findMany: jest.fn() },
    cashSession: { findFirst: jest.fn() },
    customerAccountMovement: { findMany: jest.fn(), groupBy: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
  },
  basePrisma: {
    organization: { findUnique: jest.fn() },
    storeSettings: { findUnique: jest.fn() },
  },
}));

jest.mock("../../src/config/tenantContext", () => ({
  requireOrganizationId: jest.fn().mockReturnValue("org-1"),
}));
jest.mock("../../src/services/whatsappService", () => ({ sendDocument: jest.fn(), normalizePhone: jest.fn() }));
jest.mock("../../src/config/storage", () => ({ uploadToR2: jest.fn() }));
jest.mock("../../src/services/accountStatementPdf", () => ({ buildAccountStatementPdf: jest.fn() }));

const p = prisma as unknown as {
  customer: { findFirst: jest.Mock };
  $transaction: jest.Mock;
};

const makeTx = () => ({
  $queryRaw: jest.fn().mockResolvedValue([]),
  customerAccountMovement: {
    groupBy: jest.fn(),
    create: jest.fn(),
    findFirst: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
    // The tenant extension (config/db.ts) throws on singular update/delete for
    // multi-tenant models, so the mock must fail the same way.
    update: jest.fn(() => {
      throw new Error('Operación "update" no permitida en modelo multi-tenant');
    }),
    delete: jest.fn(() => {
      throw new Error('Operación "delete" no permitida en modelo multi-tenant');
    }),
  },
});

const sums = (charge: number | null, payment: number | null) => [
  ...(charge === null ? [] : [{ type: "CHARGE", _sum: { amount: charge } }]),
  ...(payment === null ? [] : [{ type: "PAYMENT", _sum: { amount: payment } }]),
];

describe("customerAccountService.registerPayment — date", () => {
  let tx: ReturnType<typeof makeTx>;
  beforeEach(() => {
    jest.clearAllMocks();
    tx = makeTx();
    p.$transaction.mockImplementation((cb: any) => cb(tx));
    p.customer.findFirst.mockResolvedValue({ id: "c-1" });
    tx.customerAccountMovement.groupBy.mockResolvedValue(sums(300, 100));
    tx.customerAccountMovement.create.mockImplementation(async ({ data }: any) => ({ id: "m-9", ...data }));
  });

  it("uses the given date as createdAt", async () => {
    const date = new Date("2026-01-15T10:00:00Z");
    await customerAccountService.registerPayment("c-1", { amount: 10, method: "QR", date }, "u-1");
    expect(tx.customerAccountMovement.create.mock.calls[0][0].data.createdAt).toBe(date);
  });

  it("omits createdAt when no date is given", async () => {
    await customerAccountService.registerPayment("c-1", { amount: 10, method: "QR" }, "u-1");
    expect(tx.customerAccountMovement.create.mock.calls[0][0].data).not.toHaveProperty("createdAt");
  });
});

describe("customerAccountService.updateMovement / deleteMovement", () => {
  let tx: ReturnType<typeof makeTx>;
  const charge = {
    id: "m-1", customerId: "c-1", type: "CHARGE", amount: 300, saleId: null,
    method: null, cashSessionId: null, cashSession: null,
  };
  const payment = {
    id: "m-2", customerId: "c-1", type: "PAYMENT", amount: 100, saleId: null,
    method: "TRANSFERENCIA", cashSessionId: null, cashSession: null,
  };

  // The balance is read once (before the change); the "after" value is derived arithmetically.
  const setup = (movement: any, balance = 200) => {
    tx.customerAccountMovement.findFirst.mockResolvedValue(movement);
    tx.customerAccountMovement.groupBy.mockResolvedValue(sums(balance, 0));
  };

  beforeEach(() => {
    jest.clearAllMocks();
    tx = makeTx();
    p.$transaction.mockImplementation((cb: any) => cb(tx));
    p.customer.findFirst.mockResolvedValue({ id: "c-1" });
    tx.customerAccountMovement.updateMany.mockResolvedValue({ count: 1 });
    tx.customerAccountMovement.deleteMany.mockResolvedValue({ count: 1 });
  });

  it("locks the customer row and scopes the movement lookup by org + customer", async () => {
    setup(charge);
    await customerAccountService.updateMovement("c-1", "m-1", { note: "x" });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.customerAccountMovement.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "m-1", customerId: "c-1", organizationId: "org-1" } }),
    );
  });

  it("edits a manual CHARGE: balance = balance - old + new", async () => {
    setup(charge, 200);
    const date = new Date("2026-01-01T00:00:00Z");
    const r = await customerAccountService.updateMovement("c-1", "m-1", {
      amount: 250.456,
      date,
      note: "  vieja ",
    });
    expect(tx.customerAccountMovement.updateMany).toHaveBeenCalledWith({
      where: { id: "m-1", customerId: "c-1", organizationId: "org-1" },
      data: { amount: 250.46, createdAt: date, note: "vieja" },
    });
    expect(r.balance).toBe(150.46);
    expect(r.movement).toMatchObject({ id: "m-1" });
  });

  it("only sends provided fields; empty note becomes null", async () => {
    setup(payment, 200);
    await customerAccountService.updateMovement("c-1", "m-2", { note: "   " });
    expect(tx.customerAccountMovement.updateMany).toHaveBeenCalledWith({
      where: { id: "m-2", customerId: "c-1", organizationId: "org-1" },
      data: { note: null },
    });
  });

  it("edits a PAYMENT: balance = balance + old - new", async () => {
    setup(payment, 200);
    const r = await customerAccountService.updateMovement("c-1", "m-2", { amount: 60 });
    expect(r.balance).toBe(240);
  });

  it("raising a PAYMENT beyond the balance leaves credit (negative balance)", async () => {
    setup(payment, 200); // payment 100 → 200 + 100 - 400 = -100
    const r = await customerAccountService.updateMovement("c-1", "m-2", { amount: 400 });
    expect(tx.customerAccountMovement.updateMany).toHaveBeenCalledTimes(1);
    expect(r.balance).toBe(-100);
  });

  it("lowering a CHARGE below what was already paid leaves credit", async () => {
    setup(charge, 200); // charge 300 → 200 - 300 + 50 = -50
    const r = await customerAccountService.updateMovement("c-1", "m-1", { amount: 50 });
    expect(tx.customerAccountMovement.updateMany).toHaveBeenCalledTimes(1);
    expect(r.balance).toBe(-50);
  });

  it("CHARGE linked to a sale is immutable (edit and delete)", async () => {
    setup({ ...charge, saleId: "s-1" });
    await expect(customerAccountService.updateMovement("c-1", "m-1", { note: "x" })).rejects.toMatchObject({
      code: "MOVEMENT_IMMUTABLE",
    });
    await expect(customerAccountService.deleteMovement("c-1", "m-1")).rejects.toMatchObject({
      code: "MOVEMENT_IMMUTABLE",
    });
    expect(tx.customerAccountMovement.updateMany).not.toHaveBeenCalled();
    expect(tx.customerAccountMovement.deleteMany).not.toHaveBeenCalled();
  });

  it("EFECTIVO payment on a CLOSED cash session cannot be edited or deleted", async () => {
    setup({ ...payment, method: "EFECTIVO", cashSessionId: "cs-1", cashSession: { status: "CLOSED" } });
    await expect(customerAccountService.updateMovement("c-1", "m-2", { amount: 5 })).rejects.toMatchObject({
      code: "CASH_SESSION_CLOSED",
    });
    await expect(customerAccountService.deleteMovement("c-1", "m-2")).rejects.toMatchObject({
      code: "CASH_SESSION_CLOSED",
    });
  });

  it("EFECTIVO payment on an OPEN cash session can be edited", async () => {
    setup({ ...payment, method: "EFECTIVO", cashSessionId: "cs-1", cashSession: { status: "OPEN" } });
    const r = await customerAccountService.updateMovement("c-1", "m-2", { amount: 90 });
    expect(r.balance).toBe(210);
  });

  it("unknown / other-customer movement → MOVEMENT_NOT_FOUND", async () => {
    setup(null as any);
    await expect(customerAccountService.updateMovement("c-1", "nope", { note: "x" })).rejects.toMatchObject({
      code: "MOVEMENT_NOT_FOUND",
    });
    await expect(customerAccountService.deleteMovement("c-1", "nope")).rejects.toMatchObject({
      code: "MOVEMENT_NOT_FOUND",
    });
  });

  it("unknown customer → CUSTOMER_NOT_FOUND", async () => {
    p.customer.findFirst.mockResolvedValue(null);
    await expect(customerAccountService.updateMovement("x", "m-1", { note: "a" })).rejects.toMatchObject({
      code: "CUSTOMER_NOT_FOUND",
    });
    await expect(customerAccountService.deleteMovement("x", "m-1")).rejects.toMatchObject({
      code: "CUSTOMER_NOT_FOUND",
    });
  });

  it("deletes a PAYMENT: balance goes up", async () => {
    setup(payment, 200);
    const r = await customerAccountService.deleteMovement("c-1", "m-2", "u-1");
    expect(tx.customerAccountMovement.deleteMany).toHaveBeenCalledWith({
      where: { id: "m-2", customerId: "c-1", organizationId: "org-1" },
    });
    expect(r).toEqual({ deletedId: "m-2", balance: 300 });
  });

  it("deletes a manual CHARGE when the balance stays >= 0", async () => {
    setup(charge, 300);
    const r = await customerAccountService.deleteMovement("c-1", "m-1");
    expect(r.balance).toBe(0);
  });

  it("deleting a CHARGE that leaves a negative balance is allowed (credit)", async () => {
    setup(charge, 200); // 200 - 300 = -100
    const r = await customerAccountService.deleteMovement("c-1", "m-1");
    expect(tx.customerAccountMovement.deleteMany).toHaveBeenCalledTimes(1);
    expect(r.balance).toBe(-100);
  });
});

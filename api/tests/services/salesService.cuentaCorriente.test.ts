/**
 * Unit tests — venta a cuenta corriente (cuenta-corriente T2).
 * createSale con una fila CUENTA_CORRIENTE exige customerId (de la org) y crea
 * el CHARGE del libro en la MISMA transacción; deleteSale revierte esa deuda.
 */
import SaleService from "../../src/services/salesService";
import { prisma, basePrisma } from "../../src/config/db";

jest.mock("../../src/config/db", () => ({
  prisma: {
    branch: { findFirst: jest.fn() },
    cashSession: { findFirst: jest.fn() },
    sale: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  },
  basePrisma: {
    branchAssignment: { findMany: jest.fn() },
    user: { findFirst: jest.fn() },
  },
}));

jest.mock("../../src/config/tenantContext", () => ({
  requireOrganizationId: jest.fn().mockReturnValue("org-1"),
}));
jest.mock("../../src/services/mailService", () => ({ sendMail: jest.fn() }));
jest.mock("../../src/realtime/socket", () => ({ emitOrdersChanged: jest.fn() }));

const mockedPrisma = prisma as unknown as {
  sale: { findFirst: jest.Mock };
  $transaction: jest.Mock;
};
const mockedBase = basePrisma as unknown as { user: { findFirst: jest.Mock } };

const makeTx = () => ({
  product: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
  productStock: { findFirst: jest.fn(), updateMany: jest.fn() },
  looseStock: { findFirst: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
  sale: { create: jest.fn(), deleteMany: jest.fn() },
  order: { findFirst: jest.fn(), updateMany: jest.fn() },
  customer: { findFirst: jest.fn() },
  customerAccountMovement: { create: jest.fn(), deleteMany: jest.fn() },
});

const line = (quantity: number, price: number) => ({
  productId: "p-1",
  name: "Bolsa",
  quantity,
  price,
  category: "x",
});

const runSale = async (products: any[], extra: any = {}, customer: any = { id: "c-1" }) => {
  const tx = makeTx();
  mockedPrisma.$transaction.mockImplementation((cb: any) => cb(tx));
  tx.product.findFirst.mockResolvedValue({
    id: "p-1",
    name: "Bolsa",
    price: 100,
    quantity: 100,
    category: { name: "x" },
  });
  tx.product.updateMany.mockResolvedValue({ count: 1 });
  tx.sale.create.mockResolvedValue({ id: "s-1", items: [] });
  tx.order.findFirst.mockResolvedValue(null);
  tx.customer.findFirst.mockResolvedValue(customer);
  const result = await SaleService.createSale({ products, ...extra }, "u-admin", "ADMIN").catch(
    (e: any) => e,
  );
  return { tx, result };
};

describe("salesService.createSale — cuenta corriente", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedBase.user.findFirst.mockResolvedValue({ sellsWholesale: false });
  });

  it("CC payment + customerId: persists the payment and creates the CHARGE in the same transaction", async () => {
    const { tx } = await runSale([line(1, 100)], {
      customerId: "c-1",
      payments: [{ method: "CUENTA_CORRIENTE", amount: 100 }],
    });

    expect(tx.customer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "c-1", organizationId: "org-1" } }),
    );
    expect(tx.sale.create.mock.calls[0][0].data.payments.create).toEqual([
      { method: "CUENTA_CORRIENTE", amount: 100, cashSessionId: undefined },
    ]);
    expect(tx.customerAccountMovement.create).toHaveBeenCalledTimes(1);
    expect(tx.customerAccountMovement.create).toHaveBeenCalledWith({
      data: {
        organizationId: "org-1",
        customerId: "c-1",
        type: "CHARGE",
        amount: 100,
        saleId: "s-1",
        createdById: "u-admin",
      },
    });
  });

  it("split payment: CHARGE amount is only the CC part", async () => {
    const { tx } = await runSale([line(1, 100)], {
      customerId: "c-1",
      payments: [
        { method: "EFECTIVO", amount: 40 },
        { method: "CUENTA_CORRIENTE", amount: 60 },
      ],
    });

    expect(tx.customerAccountMovement.create.mock.calls[0][0].data.amount).toBe(60);
    expect(tx.sale.create.mock.calls[0][0].data.payments.create).toHaveLength(2);
  });

  it("CC payment without customerId → CUSTOMER_REQUIRED_FOR_ACCOUNT, nothing persisted", async () => {
    const { tx, result } = await runSale([line(1, 100)], {
      payments: [{ method: "CUENTA_CORRIENTE", amount: 100 }],
    });

    expect(result).toBeInstanceOf(Error);
    expect(result.code).toBe("CUSTOMER_REQUIRED_FOR_ACCOUNT");
    expect(result.message).toBe("Seleccioná un cliente para la venta en cuenta corriente");
    expect(tx.sale.create).not.toHaveBeenCalled();
    expect(tx.customerAccountMovement.create).not.toHaveBeenCalled();
  });

  it("customer of another org / nonexistent → CUSTOMER_NOT_FOUND, nothing persisted", async () => {
    const { tx, result } = await runSale(
      [line(1, 100)],
      { customerId: "c-x", payments: [{ method: "CUENTA_CORRIENTE", amount: 100 }] },
      null,
    );

    expect(result.code).toBe("CUSTOMER_NOT_FOUND");
    expect(result.message).toBe("Cliente no encontrado");
    expect(tx.sale.create).not.toHaveBeenCalled();
    expect(tx.customerAccountMovement.create).not.toHaveBeenCalled();
  });

  it("no CC row: a stray customerId is ignored (no lookup, no CHARGE)", async () => {
    const { tx } = await runSale([line(1, 100)], {
      customerId: "c-1",
      payments: [{ method: "EFECTIVO", amount: 100 }],
    });

    expect(tx.customer.findFirst).not.toHaveBeenCalled();
    expect(tx.customerAccountMovement.create).not.toHaveBeenCalled();
    expect(tx.sale.create).toHaveBeenCalledTimes(1);
  });

  it("CC rows never get the card surcharge; Σ payments still == totalAmount", async () => {
    const { tx } = await runSale([line(1, 100)], {
      customerId: "c-1",
      surchargePct: 10,
      payments: [
        { method: "TARJETA_CREDITO", amount: 50 },
        { method: "CUENTA_CORRIENTE", amount: 50 },
      ],
    });

    const data = tx.sale.create.mock.calls[0][0].data;
    expect(data.surcharge).toBe(5);
    expect(data.totalAmount).toBe(105);
    expect(data.payments.create.map((p: any) => [p.method, p.amount])).toEqual([
      ["TARJETA_CREDITO", 55],
      ["CUENTA_CORRIENTE", 50],
    ]);
    expect(tx.customerAccountMovement.create.mock.calls[0][0].data.amount).toBe(50);
  });
});

describe("salesService.deleteSale — cuenta corriente", () => {
  beforeEach(() => jest.clearAllMocks());

  it("deletes the sale's CHARGE movements so the customer debt is reverted", async () => {
    mockedPrisma.sale.findFirst.mockResolvedValue({
      id: "s-1",
      organizationId: "org-1",
      branchId: null,
      orderId: null,
      invoice: null,
      items: [],
    });
    const tx = makeTx();
    mockedPrisma.$transaction.mockImplementation((cb: any) => cb(tx));

    await SaleService.deleteSale("s-1");

    expect(tx.customerAccountMovement.deleteMany).toHaveBeenCalledWith({
      where: { saleId: "s-1", type: "CHARGE", organizationId: "org-1" },
    });
  });
});

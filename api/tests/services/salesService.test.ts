import SaleService from "../../src/services/salesService";
import { prisma, basePrisma } from "../../src/config/db";

jest.mock("../../src/config/db", () => ({
  prisma: {
    branch: { findFirst: jest.fn() },
    sale: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
  basePrisma: {
    branchAssignment: { findMany: jest.fn() },
    organization: { findUnique: jest.fn() },
    storeSettings: { findUnique: jest.fn() },
  },
}));

jest.mock("../../src/config/tenantContext", () => ({
  requireOrganizationId: jest.fn().mockReturnValue("org-1"),
}));

jest.mock("../../src/services/mailService", () => ({
  sendMail: jest.fn(),
}));

jest.mock("../../src/realtime/socket", () => ({
  emitOrdersChanged: jest.fn(),
}));

const mockedPrisma = prisma as unknown as {
  branch: { findFirst: jest.Mock };
  sale: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    deleteMany: jest.Mock;
  };
  $transaction: jest.Mock;
};

const mockedBase = basePrisma as unknown as {
  branchAssignment: { findMany: jest.Mock };
};

const makeTx = () => ({
  product: { findFirst: jest.fn(), updateMany: jest.fn() },
  productStock: { findFirst: jest.fn(), updateMany: jest.fn() },
  sale: { create: jest.fn(), deleteMany: jest.fn() },
  order: { findFirst: jest.fn(), updateMany: jest.fn() },
});

const branchProduct = {
  id: "p-1",
  name: "Alimento 15kg",
  price: 4500,
  quantity: 10,
  priceKgSuelto: 360,
  category: { name: "Balanceados" },
};

describe("salesService.getAllSales", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("passes branchId to Prisma findMany where clause when provided", async () => {
    mockedPrisma.sale.findMany.mockResolvedValue([
      { id: "s-1", branchId: "br-abc", totalAmount: 100 },
    ]);

    await SaleService.getAllSales("br-abc");

    expect(mockedPrisma.sale.findMany).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.sale.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ branchId: "br-abc" }),
      }),
    );
  });

  it("omits branchId from where when not provided (backward-compat, org-wide)", async () => {
    mockedPrisma.sale.findMany.mockResolvedValue([
      { id: "s-1", totalAmount: 100 },
      { id: "s-2", totalAmount: 200 },
    ]);

    await SaleService.getAllSales();

    expect(mockedPrisma.sale.findMany).toHaveBeenCalledTimes(1);
    const callArgs = mockedPrisma.sale.findMany.mock.calls[0][0];
    expect(callArgs.where).toBeDefined();
    expect(callArgs.where.branchId).toBeUndefined();
  });

  it("preserves include structure (items + invoice) alongside branchId filter", async () => {
    mockedPrisma.sale.findMany.mockResolvedValue([
      { id: "s-1", branchId: "br-xyz", items: [], invoice: null },
    ]);

    await SaleService.getAllSales("br-xyz");

    const callArgs = mockedPrisma.sale.findMany.mock.calls[0][0];
    expect(callArgs.include).toBeDefined();
    expect(callArgs.include.items).toBeDefined();
    expect(callArgs.include.invoice).toBeDefined();
  });
});

// ── createSale: decimal quantities + saleMode (B-06/B-07/B-08) ──
describe("salesService.createSale — loose decimal flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const vendorArgs: [string, string] = ["u-1", "VENDEDOR"];

  const withVendorBranch = () => {
    mockedBase.branchAssignment.findMany.mockResolvedValue([{ branchId: "b-1" }]);
    (prisma.branch.findFirst as unknown as jest.Mock).mockResolvedValue({
      id: "b-1",
      isActive: true,
    });
  };

  it("POR_PESO 2.35kg: branch stock decrements 10 → 7.65, SaleItem stores decimal + saleMode", async () => {
    const tx = makeTx();
    mockedPrisma.$transaction.mockImplementation((cb: any) => cb(tx));
    withVendorBranch();
    tx.product.findFirst.mockResolvedValue(branchProduct);
    tx.productStock.findFirst.mockResolvedValue({ id: "ps-1", quantity: 10 });
    tx.productStock.updateMany.mockResolvedValue({ count: 1 });
    tx.sale.create.mockResolvedValue({ id: "s-1", items: [] });
    tx.order.findFirst.mockResolvedValue(null);

    await SaleService.createSale(
      {
        products: [
          {
            productId: "p-1",
            name: "Alimento 15kg",
            quantity: 2.35,
            price: 360,
            category: "Balanceados",
            saleMode: "POR_PESO",
          },
        ],
      },
      ...vendorArgs,
    );

    expect(tx.productStock.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ quantity: { gte: 2.35 } }),
        data: { quantity: { decrement: 2.35 } },
      }),
    );
    expect(tx.sale.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalAmount: 846, // round2(2.35 × 360)
          items: {
            create: [
              expect.objectContaining({
                quantity: 2.35,
                saleMode: "POR_PESO",
                price: 360,
              }),
            ],
          },
        }),
      }),
    );
  });

  it("POR_MONTO amount 500 at priceKgSuelto 150.25: kg=3.33, total=500.33, stored kg reproduces total (B-07)", async () => {
    const tx = makeTx();
    mockedPrisma.$transaction.mockImplementation((cb: any) => cb(tx));
    withVendorBranch();
    tx.product.findFirst.mockResolvedValue({
      ...branchProduct,
      priceKgSuelto: 150.25,
    });
    tx.productStock.findFirst.mockResolvedValue({ id: "ps-1", quantity: 10 });
    tx.productStock.updateMany.mockResolvedValue({ count: 1 });
    tx.sale.create.mockResolvedValue({ id: "s-1", items: [] });
    tx.order.findFirst.mockResolvedValue(null);

    await SaleService.createSale(
      {
        products: [
          {
            productId: "p-1",
            name: "Alimento 15kg",
            quantity: 500, // monto en $
            price: 150.25,
            category: "Balanceados",
            saleMode: "POR_MONTO",
          },
        ],
      },
      ...vendorArgs,
    );

    const saleCreateCall = tx.sale.create.mock.calls[0][0];
    const storedItem = saleCreateCall.data.items.create[0];
    expect(storedItem.quantity).toBe(3.33); // round2(500 ÷ 150.25)
    expect(storedItem.price).toBe(150.25); // priceKgSuelto snapshot
    expect(saleCreateCall.data.totalAmount).toBe(500.33); // round2(3.33 × 150.25)
    // Reconciliation: stored kg × stored priceKgSuelto reproduces total exactly.
    expect(Math.round(storedItem.quantity * storedItem.price * 100) / 100).toBe(
      saleCreateCall.data.totalAmount,
    );
  });

  it("POR_MONTO usa el precio de la CELDA del payload cuando difiere del priceKgSuelto almacenado (C-05)", async () => {
    const tx = makeTx();
    mockedPrisma.$transaction.mockImplementation((cb: any) => cb(tx));
    withVendorBranch();
    // Almacenado 7500, pero la celda de la planilla manda 9200 en el payload.
    tx.product.findFirst.mockResolvedValue({
      ...branchProduct,
      priceKgSuelto: 7500,
    });
    tx.productStock.findFirst.mockResolvedValue({ id: "ps-1", quantity: 10 });
    tx.productStock.updateMany.mockResolvedValue({ count: 1 });
    tx.sale.create.mockResolvedValue({ id: "s-1", items: [] });
    tx.order.findFirst.mockResolvedValue(null);

    await SaleService.createSale(
      {
        products: [
          {
            productId: "p-1",
            name: "Alimento 15kg",
            quantity: 15000, // monto en $
            price: 9200, // precio de la celda de la planilla
            category: "Balanceados",
            saleMode: "POR_MONTO",
          },
        ],
      },
      ...vendorArgs,
    );

    // Stock descontado por el kg de la CELDA: round2(15000 ÷ 9200) = 1.63,
    // NO round2(15000 ÷ 7500) = 2.00 del priceKgSuelto almacenado.
    expect(tx.productStock.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ quantity: { gte: 1.63 } }),
        data: { quantity: { decrement: 1.63 } },
      }),
    );

    const saleCreateCall = tx.sale.create.mock.calls[0][0];
    const storedItem = saleCreateCall.data.items.create[0];
    expect(storedItem.quantity).toBe(1.63); // round2(15000 ÷ 9200)
    expect(storedItem.price).toBe(9200); // snapshot = precio de la celda, NO 7500
    expect(saleCreateCall.data.totalAmount).toBe(14996); // round2(1.63 × 9200)
    // Reconciliation: kg de la celda × precio de la celda reproduce el total.
    expect(Math.round(storedItem.quantity * storedItem.price * 100) / 100).toBe(
      saleCreateCall.data.totalAmount,
    );
  });

  it("legacy BOLSA_CERRADA (absent saleMode) stays integer flow and total (B-03)", async () => {
    const tx = makeTx();
    mockedPrisma.$transaction.mockImplementation((cb: any) => cb(tx));
    tx.product.findFirst.mockResolvedValue({
      ...branchProduct,
      priceKgSuelto: null,
    });
    tx.productStock.findFirst.mockResolvedValue({ id: "ps-1", quantity: 10 });
    tx.productStock.updateMany.mockResolvedValue({ count: 1 });
    tx.product.updateMany.mockResolvedValue({ count: 1 });
    tx.sale.create.mockResolvedValue({ id: "s-1", items: [] });
    tx.order.findFirst.mockResolvedValue(null);

    await SaleService.createSale(
      {
        products: [
          { productId: "p-1", name: "Alimento", quantity: 3, price: 100, category: "x" },
        ],
      },
      "u-admin",
      "ADMIN",
    );

    // ADMIN path: legacy product.quantity decrement (no branch).
    expect(tx.product.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ quantity: { gte: 3 } }),
        data: { quantity: { decrement: 3 } },
      }),
    );
    expect(tx.sale.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalAmount: 300,
          items: {
            create: [
              expect.objectContaining({
                quantity: 3,
                saleMode: "BOLSA_CERRADA",
              }),
            ],
          },
        }),
      }),
    );
  });

  it("POR_PESO on a product without priceKgSuelto → LOOSE_NOT_ELIGIBLE", async () => {
    const tx = makeTx();
    mockedPrisma.$transaction.mockImplementation((cb: any) => cb(tx));
    withVendorBranch();
    tx.product.findFirst.mockResolvedValue({
      ...branchProduct,
      priceKgSuelto: null,
    });

    const err: any = await SaleService.createSale(
      {
        products: [
          {
            productId: "p-1",
            name: "Alimento",
            quantity: 2.5,
            price: 360,
            category: "x",
            saleMode: "POR_PESO",
          },
        ],
      },
      ...vendorArgs,
    ).catch((e: any) => e);

    expect(err.code).toBe("LOOSE_NOT_ELIGIBLE");
    expect(tx.sale.create).not.toHaveBeenCalled();
  });

  it("POR_MONTO loose line without branch assignment (ADMIN path) → LOOSE_REQUIRES_BRANCH (B-06 amendment)", async () => {
    const tx = makeTx();
    mockedPrisma.$transaction.mockImplementation((cb: any) => cb(tx));
    tx.product.findFirst.mockResolvedValue(branchProduct);

    const err: any = await SaleService.createSale(
      {
        products: [
          {
            productId: "p-1",
            name: "Alimento",
            quantity: 500,
            price: 360,
            category: "x",
            saleMode: "POR_MONTO",
          },
        ],
      },
      "u-admin",
      "ADMIN",
    ).catch((e: any) => e);

    expect(err.code).toBe("LOOSE_REQUIRES_BRANCH");
    expect(tx.sale.create).not.toHaveBeenCalled();
  });

  it("BOLSA_CERRADA line without branch assignment keeps the legacy path (not rejected)", async () => {
    const tx = makeTx();
    mockedPrisma.$transaction.mockImplementation((cb: any) => cb(tx));
    tx.product.findFirst.mockResolvedValue({ ...branchProduct, priceKgSuelto: null });
    tx.product.updateMany.mockResolvedValue({ count: 1 });
    tx.sale.create.mockResolvedValue({ id: "s-1", items: [] });
    tx.order.findFirst.mockResolvedValue(null);

    await SaleService.createSale(
      {
        products: [
          {
            productId: "p-1",
            name: "Alimento",
            quantity: 2,
            price: 100,
            category: "x",
            saleMode: "BOLSA_CERRADA",
          },
        ],
      },
      "u-admin",
      "ADMIN",
    );

    expect(tx.product.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.sale.create).toHaveBeenCalledTimes(1);
  });

  it("mixed cart: bolsa int line + loose decimal line sum exact per-line totals (B-08)", async () => {
    const tx = makeTx();
    mockedPrisma.$transaction.mockImplementation((cb: any) => cb(tx));
    withVendorBranch();
    tx.product.findFirst
      .mockResolvedValueOnce({ ...branchProduct, priceKgSuelto: null })
      .mockResolvedValueOnce(branchProduct);
    tx.productStock.findFirst.mockResolvedValue({ id: "ps-1", quantity: 10 });
    tx.productStock.updateMany.mockResolvedValue({ count: 1 });
    tx.sale.create.mockResolvedValue({ id: "s-1", items: [] });
    tx.order.findFirst.mockResolvedValue(null);

    await SaleService.createSale(
      {
        products: [
          { productId: "p-1", name: "Bolsa", quantity: 3, price: 100, category: "x" },
          {
            productId: "p-1",
            name: "Alimento",
            quantity: 2.35,
            price: 360,
            category: "x",
            saleMode: "POR_PESO",
          },
        ],
      },
      ...vendorArgs,
    );

    const saleCreateCall = tx.sale.create.mock.calls[0][0];
    // 300 + 846 = 1146 — suma exacta de los totales por línea.
    expect(saleCreateCall.data.totalAmount).toBe(1146);
    expect(saleCreateCall.data.items.create).toHaveLength(2);
  });
});

// ── deleteSale: restore con cantidades decimales (B-06) ──
describe("salesService.deleteSale — decimal restore", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("restores ProductStock with the exact decimal quantity on branch sale delete", async () => {
    mockedPrisma.sale.findFirst.mockResolvedValue({
      id: "s-1",
      organizationId: "org-1",
      branchId: "b-1",
      orderId: null,
      invoice: null,
      items: [
        {
          productId: "p-1",
          quantity: 3.33,
          saleMode: "POR_MONTO",
        },
      ],
    });
    const tx = makeTx();
    mockedPrisma.$transaction.mockImplementation((cb: any) => cb(tx));

    await SaleService.deleteSale("s-1");

    expect(tx.productStock.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { quantity: { increment: 3.33 } },
      }),
    );
    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });
});
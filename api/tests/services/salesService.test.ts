import SaleService from "../../src/services/salesService";
import { prisma, basePrisma } from "../../src/config/db";

jest.mock("../../src/config/db", () => ({
  prisma: {
    branch: { findFirst: jest.fn() },
    cashSession: { findFirst: jest.fn() },
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
  cashSession: { findFirst: jest.Mock };
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
  looseStock: { findFirst: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
  priceKgPrice: { findFirst: jest.fn(), findMany: jest.fn() },
  category: { findMany: jest.fn() },
  priceKgBrand: { findMany: jest.fn() },
  priceKgType: { findMany: jest.fn() },
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

// Celda de la planilla (loose-lines-stock): identifica la línea suelta.
const looseCell = {
  id: "cell-1",
  brandId: "b-1",
  typeId: "t-1",
  species: "PERRO",
  priceKg: 360,
  brand: { name: "MAXXIUM" },
  type: { name: "ADULTO" },
};

// Importa una celda resuelta por loosePriceId (tx.priceKgPrice.findFirst). Para
// los tests que pasan productId (backwards-compat) se espía resolveCellForProduct
// con jest.spyOn (evita reimplementar el matching acá).

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
    // Cash gate (R9): VENDEDOR/CASHIER necesitan una caja OPEN para vender.
    mockedPrisma.cashSession.findFirst.mockResolvedValue({
      id: "cs-1",
      branchId: "b-1",
      status: "OPEN",
    });
  };

  it("POR_PESO 2.35kg via loosePriceId: LooseStock decrements 10 → 7.65, SaleItem stores decimal + saleMode with productId null (loose-lines-stock)", async () => {
    const tx = makeTx();
    mockedPrisma.$transaction.mockImplementation((cb: any) => cb(tx));
    withVendorBranch();
    tx.product.findFirst.mockResolvedValue(branchProduct);
    tx.priceKgPrice.findFirst.mockResolvedValue(looseCell);
    tx.looseStock.findFirst.mockResolvedValue({ id: "ls-1", quantity: 10 });
    tx.looseStock.updateMany.mockResolvedValue({ count: 1 });
    tx.sale.create.mockResolvedValue({ id: "s-1", items: [] });
    tx.order.findFirst.mockResolvedValue(null);

    await SaleService.createSale(
      {
        products: [
          {
            loosePriceId: "cell-1",
            looseName: "MAXXIUM ADULTO",
            quantity: 2.35,
            price: 360,
            category: "Balanceados",
            saleMode: "POR_PESO",
          },
        ],
      },
      ...vendorArgs,
    );

    // El stock se descuenta del LooseStock de la celda, NO del ProductStock.
    expect(tx.looseStock.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          priceKgPriceId: "cell-1",
          quantity: { gte: 2.35 },
        }),
        data: { quantity: { decrement: 2.35 } },
      }),
    );
    expect(tx.productStock.updateMany).not.toHaveBeenCalled();
    expect(tx.sale.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalAmount: 846, // round2(2.35 × 360)
          items: {
            create: [
              expect.objectContaining({
                productId: null,
                loosePriceId: "cell-1",
                name: "MAXXIUM ADULTO",
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

  it("POR_PESO via loosePriceId without looseName falls back to MARCA · TIPO (loose-lines-stock)", async () => {
    const tx = makeTx();
    mockedPrisma.$transaction.mockImplementation((cb: any) => cb(tx));
    withVendorBranch();
    tx.product.findFirst.mockResolvedValue(null); // sin productId físico
    tx.priceKgPrice.findFirst.mockResolvedValue(looseCell);
    tx.looseStock.findFirst.mockResolvedValue({ id: "ls-1", quantity: 10 });
    tx.looseStock.updateMany.mockResolvedValue({ count: 1 });
    tx.sale.create.mockResolvedValue({ id: "s-1", items: [] });
    tx.order.findFirst.mockResolvedValue(null);

    await SaleService.createSale(
      {
        products: [
          {
            loosePriceId: "cell-1",
            quantity: 1,
            price: 360,
            saleMode: "POR_PESO",
          },
        ],
      },
      ...vendorArgs,
    );

    const saleCreateCall = tx.sale.create.mock.calls[0][0];
    expect(saleCreateCall.data.items.create[0].name).toBe("MAXXIUM · ADULTO");
    expect(saleCreateCall.data.items.create[0].productId).toBeNull();
  });

  it("POR_MONTO amount 500 at cell priceKg 150.25: kg=3.33, total=500.33, stored kg reproduces total (B-07)", async () => {
    const tx = makeTx();
    mockedPrisma.$transaction.mockImplementation((cb: any) => cb(tx));
    withVendorBranch();
    tx.product.findFirst.mockResolvedValue(branchProduct);
    tx.priceKgPrice.findFirst.mockResolvedValue({
      ...looseCell,
      priceKg: 150.25,
    });
    tx.looseStock.findFirst.mockResolvedValue({ id: "ls-1", quantity: 10 });
    tx.looseStock.updateMany.mockResolvedValue({ count: 1 });
    tx.sale.create.mockResolvedValue({ id: "s-1", items: [] });
    tx.order.findFirst.mockResolvedValue(null);

    await SaleService.createSale(
      {
        products: [
          {
            loosePriceId: "cell-1",
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
    expect(storedItem.price).toBe(150.25); // snapshot del precio de la celda
    expect(saleCreateCall.data.totalAmount).toBe(500.33); // round2(3.33 × 150.25)
    // Reconciliation: stored kg × stored priceKg reproduces total exactly.
    expect(Math.round(storedItem.quantity * storedItem.price * 100) / 100).toBe(
      saleCreateCall.data.totalAmount,
    );
    // El descuento de LooseStock usa los kg de la celda.
    expect(tx.looseStock.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ quantity: { gte: 3.33 } }),
        data: { quantity: { decrement: 3.33 } },
      }),
    );
  });

  it("POR_MONTO usa el precio de la CELDA del payload cuando difiere del priceKgSuelto almacenado (C-05)", async () => {
    const tx = makeTx();
    mockedPrisma.$transaction.mockImplementation((cb: any) => cb(tx));
    withVendorBranch();
    // Almacenado 7500, pero la celda/planilla manda 9200 en el payload.
    tx.product.findFirst.mockResolvedValue({
      ...branchProduct,
      priceKgSuelto: 7500,
    });
    tx.priceKgPrice.findFirst.mockResolvedValue({
      ...looseCell,
      priceKg: 9200,
    });
    tx.looseStock.findFirst.mockResolvedValue({ id: "ls-1", quantity: 10 });
    tx.looseStock.updateMany.mockResolvedValue({ count: 1 });
    tx.sale.create.mockResolvedValue({ id: "s-1", items: [] });
    tx.order.findFirst.mockResolvedValue(null);

    await SaleService.createSale(
      {
        products: [
          {
            loosePriceId: "cell-1",
            quantity: 15000, // monto en $
            price: 9200, // precio de la celda de la planilla
            category: "Balanceados",
            saleMode: "POR_MONTO",
          },
        ],
      },
      ...vendorArgs,
    );

    // LooseStock descontado por el kg de la CELDA: round2(15000 ÷ 9200) = 1.63,
    // NO round2(15000 ÷ 7500) = 2.00 del priceKgSuelto almacenado.
    expect(tx.looseStock.updateMany).toHaveBeenCalledWith(
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

  it("BOLSA_CERRADA descuenta por BOLSA (1 por unidad), no multiplica weightKg (loose-lines-stock)", async () => {
    const tx = makeTx();
    mockedPrisma.$transaction.mockImplementation((cb: any) => cb(tx));
    withVendorBranch();
    tx.product.findFirst.mockResolvedValue({
      ...branchProduct,
      weightKg: 15,
      priceKgSuelto: null,
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
            quantity: 3,
            price: 4500,
            category: "Balanceados",
            saleMode: "BOLSA_CERRADA",
          },
        ],
      },
      ...vendorArgs,
    );

    // Backfill reverse: el stock de bolsas volvió a UNIDADES → 3 bolsas = −3,
    // NO −45 (3 × weightKg).
    expect(tx.productStock.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ quantity: { gte: 3 } }),
        data: { quantity: { decrement: 3 } },
      }),
    );
    expect(tx.looseStock.updateMany).not.toHaveBeenCalled();
  });

  it("POR_PESO via productId (backwards-compat) sin celda en la planilla → LOOSE_LINE_NOT_FOUND", async () => {
    const resolveSpy = jest
      .spyOn(require("../../src/services/looseSaleService"), "resolveCellForProduct")
      .mockResolvedValue(null);
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
    resolveSpy.mockRestore();

    expect(err.code).toBe("LOOSE_LINE_NOT_FOUND");
    expect(tx.sale.create).not.toHaveBeenCalled();
  });

  it("POR_MONTO loose line without branch assignment (ADMIN path) → LOOSE_REQUIRES_BRANCH (B-06 amendment)", async () => {
    const tx = makeTx();
    mockedPrisma.$transaction.mockImplementation((cb: any) => cb(tx));
    tx.priceKgPrice.findFirst.mockResolvedValue(looseCell);

    const err: any = await SaleService.createSale(
      {
        products: [
          {
            loosePriceId: "cell-1",
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
    expect(tx.looseStock.updateMany).not.toHaveBeenCalled();
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

  it("mixed cart: bolsa int line (ProductStock) + loose decimal line (LooseStock) sum exact per-line totals (B-08/loose-lines-stock)", async () => {
    const tx = makeTx();
    mockedPrisma.$transaction.mockImplementation((cb: any) => cb(tx));
    withVendorBranch();
    tx.product.findFirst.mockResolvedValue({ ...branchProduct, priceKgSuelto: null });
    tx.priceKgPrice.findFirst.mockResolvedValue(looseCell);
    tx.productStock.findFirst.mockResolvedValue({ id: "ps-1", quantity: 10 });
    tx.productStock.updateMany.mockResolvedValue({ count: 1 });
    tx.looseStock.findFirst.mockResolvedValue({ id: "ls-1", quantity: 10 });
    tx.looseStock.updateMany.mockResolvedValue({ count: 1 });
    tx.sale.create.mockResolvedValue({ id: "s-1", items: [] });
    tx.order.findFirst.mockResolvedValue(null);

    await SaleService.createSale(
      {
        products: [
          { productId: "p-1", name: "Bolsa", quantity: 3, price: 100, category: "x" },
          {
            loosePriceId: "cell-1",
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
    // Cada pool se descuenta: bolsa → ProductStock, suelto → LooseStock.
    expect(tx.productStock.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { quantity: { decrement: 3 } } }),
    );
    expect(tx.looseStock.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { quantity: { decrement: 2.35 } } }),
    );
  });
});

// ── deleteSale: restore al pool correcto por renglón (loose-lines-stock) ──
describe("salesService.deleteSale — restore correct pool", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("restores LooseStock with the exact decimal kg for a loose line (loosePriceId, productId null)", async () => {
    mockedPrisma.sale.findFirst.mockResolvedValue({
      id: "s-1",
      organizationId: "org-1",
      branchId: "b-1",
      orderId: null,
      invoice: null,
      items: [
        {
          productId: null,
          loosePriceId: "cell-1",
          quantity: 3.33,
          saleMode: "POR_MONTO",
        },
      ],
    });
    const tx = makeTx();
    mockedPrisma.$transaction.mockImplementation((cb: any) => cb(tx));

    await SaleService.deleteSale("s-1");

    expect(tx.looseStock.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ priceKgPriceId: "cell-1" }),
        data: { quantity: { increment: 3.33 } },
      }),
    );
    expect(tx.productStock.updateMany).not.toHaveBeenCalled();
    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });

  it("restores ProductStock (unidades) for a bag line on branch sale delete", async () => {
    mockedPrisma.sale.findFirst.mockResolvedValue({
      id: "s-1",
      organizationId: "org-1",
      branchId: "b-1",
      orderId: null,
      invoice: null,
      items: [
        {
          productId: "p-1",
          loosePriceId: null,
          quantity: 3,
          saleMode: "BOLSA_CERRADA",
        },
      ],
    });
    const tx = makeTx();
    mockedPrisma.$transaction.mockImplementation((cb: any) => cb(tx));

    await SaleService.deleteSale("s-1");

    expect(tx.productStock.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ productId: "p-1" }),
        data: { quantity: { increment: 3 } },
      }),
    );
    expect(tx.looseStock.updateMany).not.toHaveBeenCalled();
    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });

  it("restores Product.quantity for a legacy bag line sold org-wide (no branch)", async () => {
    mockedPrisma.sale.findFirst.mockResolvedValue({
      id: "s-1",
      organizationId: "org-1",
      branchId: null,
      orderId: null,
      invoice: null,
      items: [
        {
          productId: "p-1",
          loosePriceId: null,
          quantity: 2,
          saleMode: "BOLSA_CERRADA",
        },
      ],
    });
    const tx = makeTx();
    mockedPrisma.$transaction.mockImplementation((cb: any) => cb(tx));

    await SaleService.deleteSale("s-1");

    expect(tx.product.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "p-1" }),
        data: { quantity: { increment: 2 } },
      }),
    );
    expect(tx.productStock.updateMany).not.toHaveBeenCalled();
    expect(tx.looseStock.updateMany).not.toHaveBeenCalled();
  });
});

// ── createSale: cash gate + SalePayment (sdd/caja-apertura-cierre R6-R9) ──
describe("salesService.createSale — cash session gate + sale payments", () => {
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
    // Cash gate (R9): VENDEDOR/CASHIER necesitan una caja OPEN para vender.
    mockedPrisma.cashSession.findFirst.mockResolvedValue({
      id: "cs-1",
      branchId: "b-1",
      status: "OPEN",
    });
  };

  const openCashSession = { id: "cs-1", branchId: "b-1", status: "OPEN" };

  const runSale = async (
    products: any[],
    extra: any = {},
    args: [string, string] = vendorArgs,
  ) => {
    const tx = makeTx();
    mockedPrisma.$transaction.mockImplementation((cb: any) => cb(tx));
    tx.product.findFirst.mockResolvedValue({ ...branchProduct, priceKgSuelto: null });
    tx.product.updateMany.mockResolvedValue({ count: 1 }); // legacy/admin path
    tx.productStock.findFirst.mockResolvedValue({ id: "ps-1", quantity: 100 });
    tx.productStock.updateMany.mockResolvedValue({ count: 1 });
    tx.sale.create.mockResolvedValue({ id: "s-1", items: [] });
    tx.order.findFirst.mockResolvedValue(null);
    const sale = await SaleService.createSale(
      { products, ...extra },
      ...args,
    ).catch((e: any) => e);
    return { tx, sale };
  };

  it("R6: single EFECTIVO payment matching total persists one SalePayment and sets cashSessionId", async () => {
    withVendorBranch();
    mockedPrisma.cashSession.findFirst.mockResolvedValue(openCashSession);
    const { tx } = await runSale(
      [{ productId: "p-1", name: "Bolsa", quantity: 1, price: 100, category: "x" }],
      { payments: [{ method: "EFECTIVO", amount: 100 }] },
    );

    const createCall = tx.sale.create.mock.calls[0][0];
    expect(createCall.data.cashSessionId).toBe("cs-1");
    expect(createCall.data.payments.create).toEqual([
      { method: "EFECTIVO", amount: 100, cashSessionId: "cs-1" },
    ]);
  });

  it("R7: mixed payments summing to total persist multiple SalePayment rows", async () => {
    withVendorBranch();
    mockedPrisma.cashSession.findFirst.mockResolvedValue(openCashSession);
    const { tx } = await runSale(
      [{ productId: "p-1", name: "Bolsa", quantity: 2, price: 50, category: "x" }],
      {
        payments: [
          { method: "EFECTIVO", amount: 50 },
          { method: "TARJETA_CREDITO", amount: 50 },
        ],
      },
    );

    const createCall = tx.sale.create.mock.calls[0][0];
    expect(createCall.data.totalAmount).toBe(100);
    expect(createCall.data.payments.create).toHaveLength(2);
  });

  it("R7: payments summing != total → PAYMENTS_DO_NOT_MATCH_TOTAL (no sale created)", async () => {
    withVendorBranch();
    mockedPrisma.cashSession.findFirst.mockResolvedValue(openCashSession);
    const { tx, sale } = await runSale(
      [{ productId: "p-1", name: "Bolsa", quantity: 1, price: 100, category: "x" }],
      {
        payments: [
          { method: "EFECTIVO", amount: 50 },
          { method: "TARJETA_CREDITO", amount: 40 },
        ],
      },
    );

    expect((sale as any).code).toBe("PAYMENTS_DO_NOT_MATCH_TOTAL");
    expect(tx.sale.create).not.toHaveBeenCalled();
  });

  it("R8: SalePayment records cashSessionId from the open session (R8)", async () => {
    withVendorBranch();
    mockedPrisma.cashSession.findFirst.mockResolvedValue(openCashSession);
    const { tx } = await runSale(
      [{ productId: "p-1", name: "Bolsa", quantity: 1, price: 100, category: "x" }],
      { payments: [{ method: "EFECTIVO", amount: 100 }] },
    );

    const createCall = tx.sale.create.mock.calls[0][0];
    expect(createCall.data.payments.create[0].cashSessionId).toBe("cs-1");
    expect(createCall.data.cashSessionId).toBe("cs-1");
  });

  it("R9: VENDEDOR without an OPEN cash session in their branch → CASH_SESSION_REQUIRED", async () => {
    withVendorBranch();
    mockedPrisma.cashSession.findFirst.mockResolvedValue(null); // no OPEN session

    const err: any = await SaleService.createSale(
      {
        products: [{ productId: "p-1", name: "Bolsa", quantity: 1, price: 100, category: "x" }],
      },
      ...vendorArgs,
    ).catch((e: any) => e);

    expect(err.code).toBe("CASH_SESSION_REQUIRED");
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("R9: VENDEDOR with an OPEN session can sell (gate passes, cashSessionId set)", async () => {
    withVendorBranch();
    mockedPrisma.cashSession.findFirst.mockResolvedValue(openCashSession);
    const { tx, sale } = await runSale(
      [{ productId: "p-1", name: "Bolsa", quantity: 1, price: 100, category: "x" }],
    );

    expect((sale as any).id).toBe("s-1");
    const createCall = tx.sale.create.mock.calls[0][0];
    expect(createCall.data.cashSessionId).toBe("cs-1");
  });

  it("R9: ADMIN is exempt from the gate and sells with cashSessionId=null (backward-compat)", async () => {
    // No branch assignment, no OPEN session lookup for ADMIN.
    mockedPrisma.cashSession.findFirst.mockResolvedValue(undefined as any);
    const { tx, sale } = await runSale(
      [{ productId: "p-1", name: "Bolsa", quantity: 2, price: 100, category: "x" }],
      { payments: [{ method: "EFECTIVO", amount: 200 }] },
      ["u-admin", "ADMIN"],
    );

    expect((sale as any).id).toBe("s-1");
    const createCall = tx.sale.create.mock.calls[0][0];
    expect(createCall.data.cashSessionId).toBeUndefined();
    // Payments still persisted (cashSessionId null), Σ == total.
    expect(createCall.data.payments.create).toEqual([
      { method: "EFECTIVO", amount: 200, cashSessionId: undefined },
    ]);
  });
});

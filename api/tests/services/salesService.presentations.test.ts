/**
 * salesService + presentaciones (sdd/product-presentations WU2). Sin DB:
 * `$transaction` recibe un `tx` mockeado. Estilo de salesService.multipack.test.ts.
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
  branch: { findFirst: jest.Mock };
  cashSession: { findFirst: jest.Mock };
  sale: { findFirst: jest.Mock };
  $transaction: jest.Mock;
};
const mockedBase = basePrisma as unknown as {
  branchAssignment: { findMany: jest.Mock };
  user: { findFirst: jest.Mock };
};

const makeTx = () => ({
  product: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
  productStock: { findFirst: jest.fn(), updateMany: jest.fn() },
  looseStock: { findFirst: jest.fn(), updateMany: jest.fn() },
  priceKgPrice: { findFirst: jest.fn() },
  sale: { create: jest.fn(), deleteMany: jest.fn() },
  order: { findFirst: jest.fn(), updateMany: jest.fn() },
  customerAccountMovement: { deleteMany: jest.fn() },
});

const presentations = [
  { id: "pr-unit", name: "Unidad", factor: 1, price: 100, wholesalePrice: 80, isActive: true },
  { id: "pr-box", name: "Caja", factor: 10, price: 900, wholesalePrice: 700, isActive: true },
  { id: "pr-off", name: "Pallet", factor: 100, price: 8000, wholesalePrice: null, isActive: false },
];
const pharmaProduct = {
  id: "p-1",
  name: "Ibuprofeno",
  price: 100,
  wholesalePrice: null,
  quantity: 500,
  unitsPerBox: 15, // debe ignorarse
  hasPresentations: true,
  category: { name: "FARMACIA" },
  presentations,
};
const legacyProduct = { ...pharmaProduct, hasPresentations: false, unitsPerBox: null, presentations: [] };

const line = (o: any = {}) => ({
  productId: "p-1", name: "Ibuprofeno", quantity: 2, price: 1, category: "x",
  saleMode: "BOLSA_CERRADA" as const, presentationId: "pr-box", ...o,
});

const setup = (product: any, wholesale = false) => {
  const tx = makeTx();
  mockedPrisma.$transaction.mockImplementation((cb: any) => cb(tx));
  mockedBase.branchAssignment.findMany.mockResolvedValue([{ branchId: "b-1" }]);
  mockedPrisma.branch.findFirst.mockResolvedValue({ id: "b-1", isActive: true });
  mockedPrisma.cashSession.findFirst.mockResolvedValue({ id: "cs-1", branchId: "b-1", status: "OPEN" });
  mockedBase.user.findFirst.mockResolvedValue({ sellsWholesale: wholesale });
  tx.product.findFirst.mockResolvedValue(product);
  tx.productStock.findFirst.mockResolvedValue({ id: "ps-1", quantity: 500 });
  tx.productStock.updateMany.mockResolvedValue({ count: 1 });
  tx.product.updateMany.mockResolvedValue({ count: 1 });
  tx.sale.create.mockResolvedValue({ id: "s-1", items: [] });
  tx.order.findFirst.mockResolvedValue(null);
  return tx;
};

beforeEach(() => jest.clearAllMocks());

describe("createSale with presentations", () => {
  it("loads presentations explicitly scoped by organizationId", async () => {
    const tx = setup(pharmaProduct);
    await SaleService.createSale({ products: [line()] }, "u-1", "VENDEDOR");
    expect(tx.product.findFirst.mock.calls[0][0].include.presentations).toEqual({
      where: { organizationId: "org-1" },
    });
  });

  it("uses the server price (client price ignored), qty × factor stock and snapshots", async () => {
    const tx = setup(pharmaProduct);
    await SaleService.createSale({ products: [line()] }, "u-1", "VENDEDOR");
    const data = tx.sale.create.mock.calls[0][0].data;
    expect(data.totalAmount).toBe(1800); // 2 × 900, no 2 × 1
    expect(data.items.create[0]).toMatchObject({
      price: 900, quantity: 2,
      presentationId: "pr-box", presentationName: "Caja", presentationFactor: 10,
    });
    // 2 cajas × 10 = 20 (ignora unitsPerBox 15)
    expect(tx.productStock.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { quantity: { decrement: 20 } } }),
    );
  });

  it("uses the wholesale price for a wholesale seller (when set)", async () => {
    const tx = setup(pharmaProduct, true);
    await SaleService.createSale({ products: [line()] }, "u-1", "VENDEDOR");
    expect(tx.sale.create.mock.calls[0][0].data.items.create[0].price).toBe(700);
  });

  it("admin sale (no branch) decrements Product.quantity by qty × factor", async () => {
    const tx = setup(pharmaProduct);
    mockedBase.branchAssignment.findMany.mockResolvedValue([]);
    await SaleService.createSale({ products: [line({ quantity: 3 })] }, "u-1", "ADMIN");
    expect(tx.product.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { quantity: { decrement: 30 } } }),
    );
  });

  it("requires presentationId for a product with presentations", async () => {
    setup(pharmaProduct);
    await expect(
      SaleService.createSale({ products: [line({ presentationId: undefined })] }, "u-1", "VENDEDOR"),
    ).rejects.toMatchObject({ code: "PRESENTATION_REQUIRED", status: 400 });
  });

  it("rejects presentationId on a product without presentations", async () => {
    setup(legacyProduct);
    await expect(
      SaleService.createSale({ products: [line()] }, "u-1", "VENDEDOR"),
    ).rejects.toMatchObject({ code: "PRESENTATION_NOT_ALLOWED" });
  });

  it("rejects foreign and inactive presentations", async () => {
    setup(pharmaProduct);
    await expect(
      SaleService.createSale({ products: [line({ presentationId: "other" })] }, "u-1", "VENDEDOR"),
    ).rejects.toMatchObject({ code: "PRESENTATION_NOT_FOUND" });
    await expect(
      SaleService.createSale({ products: [line({ presentationId: "pr-off" })] }, "u-1", "VENDEDOR"),
    ).rejects.toMatchObject({ code: "PRESENTATION_INACTIVE" });
  });

  it.each(["POR_UNIDAD", "POR_UNIDAD_BLISTER"] as const)(
    "%s on a presentation product → 400 USE_PRESENTATION",
    async (saleMode) => {
      const tx = setup(pharmaProduct);
      await expect(
        SaleService.createSale(
          { products: [line({ saleMode, presentationId: undefined, piecesPerBlister: 10 })] },
          "u-1", "VENDEDOR",
        ),
      ).rejects.toMatchObject({ code: "USE_PRESENTATION", status: 400 });
      expect(tx.productStock.updateMany).not.toHaveBeenCalled();
    },
  );

  it("insufficient stock in base units rejects the sale", async () => {
    const tx = setup(pharmaProduct);
    tx.productStock.findFirst.mockResolvedValue({ id: "ps-1", quantity: 19 });
    await expect(
      SaleService.createSale({ products: [line()] }, "u-1", "VENDEDOR"),
    ).rejects.toThrow(/Stock insuficiente/);
    expect(tx.sale.create).not.toHaveBeenCalled();
  });
});

describe("cumulative demand across lines of the same product", () => {
  it("rejects the whole sale when the combined base units exceed stock (no sale created)", async () => {
    const tx = setup(pharmaProduct);
    // Stock simulado: 25 unidades base; cada línea lee el stock ya descontado.
    let stock = 25;
    tx.productStock.findFirst.mockImplementation(async () => ({ id: "ps-1", quantity: stock }));
    tx.productStock.updateMany.mockImplementation(async ({ where, data }: any) => {
      const need = data.quantity.decrement;
      if (stock < where.quantity.gte) return { count: 0 };
      stock -= need;
      return { count: 1 };
    });
    await expect(
      SaleService.createSale(
        { products: [line({ quantity: 1 }), line({ quantity: 1 }), line({ quantity: 1 })] }, // 3 × 10 = 30 > 25
        "u-1", "VENDEDOR",
      ),
    ).rejects.toThrow(/Stock insuficiente/);
    expect(tx.sale.create).not.toHaveBeenCalled();
  });

  it("accepts when the combined demand fits", async () => {
    const tx = setup(pharmaProduct);
    let stock = 30;
    tx.productStock.findFirst.mockImplementation(async () => ({ id: "ps-1", quantity: stock }));
    tx.productStock.updateMany.mockImplementation(async ({ data }: any) => {
      stock -= data.quantity.decrement;
      return { count: 1 };
    });
    await SaleService.createSale(
      { products: [line({ quantity: 1 }), line({ presentationId: "pr-unit", quantity: 20 })] },
      "u-1", "VENDEDOR",
    );
    expect(stock).toBe(0);
    expect(tx.sale.create).toHaveBeenCalledTimes(1);
  });
});

describe("legacy products without presentations are unchanged", () => {
  it("BOLSA_CERRADA keeps client price, cajaMultiplier and omits presentation snapshots", async () => {
    const tx = setup(legacyProduct);
    await SaleService.createSale(
      { products: [line({ presentationId: undefined, price: 1000, quantity: 1 })] },
      "u-1", "VENDEDOR",
    );
    // unitsPerBox null en legacyProduct → multiplicador 1
    const item = tx.sale.create.mock.calls[0][0].data.items.create[0];
    expect(item.price).toBe(1000);
    expect(item.presentationId).toBeUndefined();
    expect(item.presentationFactor).toBeUndefined();
  });
});

describe("deleteSale restores presentation stock", () => {
  const sale = (items: any[], branchId: string | null) => ({
    id: "s-1", organizationId: "org-1", branchId, orderId: null, invoice: null, items,
  });

  it("branch sale: restores quantity × presentationFactor for presentation items only", async () => {
    const tx = makeTx();
    mockedPrisma.$transaction.mockImplementation((cb: any) => cb(tx));
    mockedPrisma.sale.findFirst.mockResolvedValue(
      sale(
        [
          { productId: "p-1", quantity: 2, presentationFactor: 10, loosePriceId: null },
          { productId: "p-2", quantity: 3, presentationFactor: null, loosePriceId: null },
        ],
        "b-1",
      ),
    );
    await SaleService.deleteSale("s-1");
    const incs = tx.productStock.updateMany.mock.calls.map((c: any) => [c[0].where.productId, c[0].data.quantity.increment]);
    expect(incs).toEqual([["p-1", 20], ["p-2", 3]]);
  });

  it("global (admin) sale: restores quantity × factor into Product.quantity", async () => {
    const tx = makeTx();
    mockedPrisma.$transaction.mockImplementation((cb: any) => cb(tx));
    mockedPrisma.sale.findFirst.mockResolvedValue(
      sale([{ productId: "p-1", quantity: 4, presentationFactor: 5, loosePriceId: null }], null),
    );
    await SaleService.deleteSale("s-1");
    expect(tx.product.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { quantity: { increment: 20 } } }),
    );
  });
});

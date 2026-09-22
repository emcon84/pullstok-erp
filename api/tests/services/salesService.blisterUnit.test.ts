/**
 * Tests de salesService para la venta de pastillas sueltas de un blister
 * (sdd/venta-pastillas-sueltas-blister, task T2). Archivo aparte, mismo
 * patrón que salesService.multipack.test.ts: sin DB, `$transaction` recibe
 * un `tx` mockeado y se espía la deducción de stock y el total generado.
 *
 * Foco: precio recomputado server-side (ignora el price del cliente y usa
 * piecesPerBlister del REQUEST, no product.unitsPerBox); total = precio por
 * pastilla × cantidad de pastillas; stock SIEMPRE descuenta 1 blister por
 * línea sin importar la cantidad de pastillas vendidas; rechazo sin
 * piecesPerBlister o sin producto.
 */
import SaleService from "../../src/services/salesService";
import { prisma, basePrisma } from "../../src/config/db";

jest.mock("../../src/config/db", () => ({
  prisma: {
    branch: { findFirst: jest.fn() },
    cashSession: { findFirst: jest.fn() },
    sale: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), deleteMany: jest.fn() },
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
  sale: { create: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock; deleteMany: jest.Mock };
  $transaction: jest.Mock;
};
const mockedBase = basePrisma as unknown as { branchAssignment: { findMany: jest.Mock } };

const makeTx = () => ({
  product: { findFirst: jest.fn(), updateMany: jest.fn() },
  productStock: { findFirst: jest.fn(), updateMany: jest.fn() },
  looseStock: { findFirst: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
  priceKgPrice: { findFirst: jest.fn() },
  sale: { create: jest.fn() },
  order: { findFirst: jest.fn(), updateMany: jest.fn() },
});

const vendorArgs: [string, string] = ["u-1", "VENDEDOR"];

// FARMACIA: blister sin unitsPerBox (el conteo NO se persiste en catálogo —
// se carga ad-hoc por venta). Precio de caja/blister = 4500.
const blisterProduct = {
  id: "p-1",
  name: "IBUPROFENO 400 X BLISTER",
  price: 4500,
  quantity: 20, // stock en UNIDADES de blister
  unitsPerBox: null,
  priceKgSuelto: null,
  category: { name: "FARMACIA" },
};

const withVendorBranch = () => {
  mockedBase.branchAssignment.findMany.mockResolvedValue([{ branchId: "b-1" }]);
  (mockedPrisma.branch.findFirst as unknown as jest.Mock).mockResolvedValue({
    id: "b-1",
    isActive: true,
  });
  mockedPrisma.cashSession.findFirst.mockResolvedValue({
    id: "cs-1",
    branchId: "b-1",
    status: "OPEN",
  });
};

describe("blister: POR_UNIDAD_BLISTER server-authoritative recompute", () => {
  beforeEach(() => jest.clearAllMocks());

  it("recomputa el precio por pastilla server-side (ignora price del cliente) usando piecesPerBlister del request", async () => {
    const tx = makeTx();
    mockedPrisma.$transaction.mockImplementation((cb: any) => cb(tx));
    withVendorBranch();
    tx.product.findFirst.mockResolvedValue(blisterProduct);
    tx.productStock.findFirst.mockResolvedValue({ id: "ps-1", quantity: 20 });
    tx.productStock.updateMany.mockResolvedValue({ count: 1 });
    tx.sale.create.mockResolvedValue({ id: "s-1", items: [] });
    tx.order.findFirst.mockResolvedValue(null);

    await SaleService.createSale(
      {
        products: [
          {
            productId: "p-1",
            name: "IBUPROFENO 400",
            quantity: 4, // 4 pastillas
            price: 999999, // cliente manda un precio ERRÓNEO — el server lo ignora
            category: "x",
            saleMode: "POR_UNIDAD_BLISTER",
            piecesPerBlister: 7,
          },
        ],
      },
      ...vendorArgs,
    );

    const createCall = tx.sale.create.mock.calls[0][0];
    const storedItem = createCall.data.items.create[0];
    // ceil(4500/7 a $100) = ceil(642.857/100)*100 = 700.
    expect(storedItem.price).toBe(700);
    expect(storedItem.quantity).toBe(4);
    expect(storedItem.saleMode).toBe("POR_UNIDAD_BLISTER");
    expect(storedItem.piecesPerBlister).toBe(7);
    // Total = precio por pastilla × cantidad de pastillas = 700 × 4 = 2800.
    expect(createCall.data.totalAmount).toBe(2800);
  });

  it("descuenta SIEMPRE 1 unidad de blister de stock, sin importar la cantidad de pastillas (qty=1)", async () => {
    const tx = makeTx();
    mockedPrisma.$transaction.mockImplementation((cb: any) => cb(tx));
    withVendorBranch();
    tx.product.findFirst.mockResolvedValue(blisterProduct);
    tx.productStock.findFirst.mockResolvedValue({ id: "ps-1", quantity: 20 });
    tx.productStock.updateMany.mockResolvedValue({ count: 1 });
    tx.sale.create.mockResolvedValue({ id: "s-1", items: [] });
    tx.order.findFirst.mockResolvedValue(null);

    await SaleService.createSale(
      {
        products: [
          {
            productId: "p-1",
            name: "IBUPROFENO 400",
            quantity: 1,
            price: 700,
            category: "x",
            saleMode: "POR_UNIDAD_BLISTER",
            piecesPerBlister: 7,
          },
        ],
      },
      ...vendorArgs,
    );

    expect(tx.productStock.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { quantity: { decrement: 1 } } }),
    );
  });

  it("descuenta SIEMPRE 1 unidad de blister de stock, sin importar la cantidad de pastillas (qty=10)", async () => {
    const tx = makeTx();
    mockedPrisma.$transaction.mockImplementation((cb: any) => cb(tx));
    withVendorBranch();
    tx.product.findFirst.mockResolvedValue(blisterProduct);
    tx.productStock.findFirst.mockResolvedValue({ id: "ps-1", quantity: 20 });
    tx.productStock.updateMany.mockResolvedValue({ count: 1 });
    tx.sale.create.mockResolvedValue({ id: "s-1", items: [] });
    tx.order.findFirst.mockResolvedValue(null);

    await SaleService.createSale(
      {
        products: [
          {
            productId: "p-1",
            name: "IBUPROFENO 400",
            quantity: 10,
            price: 700,
            category: "x",
            saleMode: "POR_UNIDAD_BLISTER",
            piecesPerBlister: 7,
          },
        ],
      },
      ...vendorArgs,
    );

    expect(tx.productStock.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { quantity: { decrement: 1 } } }),
    );
  });

  it("rechaza POR_UNIDAD_BLISTER cuando falta piecesPerBlister", async () => {
    const tx = makeTx();
    mockedPrisma.$transaction.mockImplementation((cb: any) => cb(tx));
    withVendorBranch();
    tx.product.findFirst.mockResolvedValue(blisterProduct);

    const err: any = await SaleService.createSale(
      {
        products: [
          { productId: "p-1", name: "x", quantity: 1, price: 700, category: "x", saleMode: "POR_UNIDAD_BLISTER" },
        ],
      },
      ...vendorArgs,
    ).catch((e: any) => e);

    expect(err.message).toMatch(/piecesPerBlister/i);
    expect(tx.sale.create).not.toHaveBeenCalled();
  });

  it("rechaza POR_UNIDAD_BLISTER cuando el producto no existe", async () => {
    const tx = makeTx();
    mockedPrisma.$transaction.mockImplementation((cb: any) => cb(tx));
    withVendorBranch();
    tx.product.findFirst.mockResolvedValue(null);

    const err: any = await SaleService.createSale(
      {
        products: [
          {
            productId: "p-does-not-exist",
            name: "x",
            quantity: 1,
            price: 700,
            category: "x",
            saleMode: "POR_UNIDAD_BLISTER",
            piecesPerBlister: 7,
          },
        ],
      },
      ...vendorArgs,
    ).catch((e: any) => e);

    expect(err.message).toMatch(/no encontrado/i);
    expect(tx.sale.create).not.toHaveBeenCalled();
  });
});

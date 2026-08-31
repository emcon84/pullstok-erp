/**
 * Tests de salesService para el multi-pack por unidad (sdd/venta-por-unidad-multpack,
 * task 2.5). Archivo aparte para no mezclarse con el suite de salesService
 * genérico (que ya tiene 2 fallas pre-existentes en el flujo POR_MONTO).
 *
 * Sin DB: `$transaction` recibe un `tx` mockeado y se espía la deducción de
 * stock y el total generado. Enfocado en: box line == precio exacto (no la
 * suma de per-unit), POR_UNIDAD recompute server-authoritative, rechazo de
 * unitsPerBox<=1, y deducción de stock en UNIDADES (box = qty×unitsPerBox,
 * unit = qty×1).
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
  basePrisma: { branchAssignment: { findMany: jest.fn() } },
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

// Multi-pack: caja de 15 unidades a 18400 → perUnitPrice server = 1226.67.
const multipackProduct = {
  id: "p-1",
  name: "FELIX POUCH X 15x85grs",
  price: 18400,
  quantity: 150, // stock en UNIDADES (post-backfill)
  unitsPerBox: 15,
  priceKgSuelto: null,
  category: { name: "Balanceados" },
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

describe("multi-pack: box line equals exact box price", () => {
  beforeEach(() => jest.clearAllMocks());

  it("BOX (BOLSA_CERRADA) total = product.price (18400), NO la suma de per-unit (1226.67×15)", async () => {
    const tx = makeTx();
    mockedPrisma.$transaction.mockImplementation((cb: any) => cb(tx));
    withVendorBranch();
    tx.product.findFirst.mockResolvedValue(multipackProduct);
    tx.productStock.findFirst.mockResolvedValue({ id: "ps-1", quantity: 150 });
    tx.productStock.updateMany.mockResolvedValue({ count: 1 });
    tx.sale.create.mockResolvedValue({ id: "s-1", items: [] });
    tx.order.findFirst.mockResolvedValue(null);

    await SaleService.createSale(
      {
        products: [
          {
            productId: "p-1",
            name: "FELIX X 15x85grs",
            quantity: 1, // 1 caja
            price: 18400, // el front manda el precio de caja
            category: "x",
            saleMode: "BOLSA_CERRADA",
          },
        ],
      },
      ...vendorArgs,
    );

    const createCall = tx.sale.create.mock.calls[0][0];
    expect(createCall.data.totalAmount).toBe(18400); // box = precio exacto
    // Stock en unidades: 1 caja × 15 unidades = −15.
    expect(tx.productStock.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { quantity: { decrement: 15 } } }),
    );
  });

  it("BOX no se calcula como perUnitPrice × unitsPerBox (regresión de drift)", async () => {
    const tx = makeTx();
    mockedPrisma.$transaction.mockImplementation((cb: any) => cb(tx));
    withVendorBranch();
    tx.product.findFirst.mockResolvedValue(multipackProduct);
    tx.productStock.findFirst.mockResolvedValue({ id: "ps-1", quantity: 150 });
    tx.productStock.updateMany.mockResolvedValue({ count: 1 });
    tx.sale.create.mockResolvedValue({ id: "s-1", items: [] });
    tx.order.findFirst.mockResolvedValue(null);

    await SaleService.createSale(
      {
        products: [
          {
            productId: "p-1",
            name: "FELIX X 15x85grs",
            quantity: 2, // 2 cajas
            price: 18400,
            category: "x",
            saleMode: "BOLSA_CERRADA",
          },
        ],
      },
      ...vendorArgs,
    );

    const createCall = tx.sale.create.mock.calls[0][0];
    // 2 cajas × 18400 = 36800. NO 2 × (1226.67 × 15) = 36800.10.
    expect(createCall.data.totalAmount).toBe(36800);
    expect(tx.productStock.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { quantity: { decrement: 30 } } }),
    );
  });
});

describe("multi-pack: POR_UNIDAD server-authoritative recompute", () => {
  beforeEach(() => jest.clearAllMocks());

  it("recomputa perUnitPrice server-side (ignora el price del cliente) y total = round2(qty×perUnitPrice)", async () => {
    const tx = makeTx();
    mockedPrisma.$transaction.mockImplementation((cb: any) => cb(tx));
    withVendorBranch();
    tx.product.findFirst.mockResolvedValue(multipackProduct);
    tx.productStock.findFirst.mockResolvedValue({ id: "ps-1", quantity: 150 });
    tx.productStock.updateMany.mockResolvedValue({ count: 1 });
    tx.sale.create.mockResolvedValue({ id: "s-1", items: [] });
    tx.order.findFirst.mockResolvedValue(null);

    await SaleService.createSale(
      {
        products: [
          {
            productId: "p-1",
            name: "FELIX X 15x85grs",
            quantity: 3, // 3 unidades
            price: 999999, // cliente manda un precio ERRÓNEO — el server lo ignora
            category: "x",
            saleMode: "POR_UNIDAD",
          },
        ],
      },
      ...vendorArgs,
    );

    const createCall = tx.sale.create.mock.calls[0][0];
    const storedItem = createCall.data.items.create[0];
    // Precio autoritativo = round2(18400/15) = 1226.67, NO 999999.
    expect(storedItem.price).toBe(1226.67);
    expect(storedItem.quantity).toBe(3);
    expect(storedItem.saleMode).toBe("POR_UNIDAD");
    expect(createCall.data.totalAmount).toBe(3680.01); // round2(3 × 1226.67) = 3680.01
    // Stock en unidades: 3 unidades × 1 = −3.
    expect(tx.productStock.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { quantity: { decrement: 3 } } }),
    );
  });

  it("rechaza POR_UNIDAD cuando unitsPerBox es null (producto no multi-pack)", async () => {
    const tx = makeTx();
    mockedPrisma.$transaction.mockImplementation((cb: any) => cb(tx));
    withVendorBranch();
    tx.product.findFirst.mockResolvedValue({ ...multipackProduct, unitsPerBox: null });

    const err: any = await SaleService.createSale(
      {
        products: [
          { productId: "p-1", name: "x", quantity: 1, price: 100, category: "x", saleMode: "POR_UNIDAD" },
        ],
      },
      ...vendorArgs,
    ).catch((e: any) => e);

    expect(err.message).toMatch(/por unidad/i);
    expect(tx.sale.create).not.toHaveBeenCalled();
  });

  it("rechaza POR_UNIDAD cuando unitsPerBox <= 1", async () => {
    const tx = makeTx();
    mockedPrisma.$transaction.mockImplementation((cb: any) => cb(tx));
    withVendorBranch();
    tx.product.findFirst.mockResolvedValue({ ...multipackProduct, unitsPerBox: 1 });

    const err: any = await SaleService.createSale(
      {
        products: [
          { productId: "p-1", name: "x", quantity: 1, price: 100, category: "x", saleMode: "POR_UNIDAD" },
        ],
      },
      ...vendorArgs,
    ).catch((e: any) => e);

    expect(err.message).toMatch(/por unidad/i);
    expect(tx.sale.create).not.toHaveBeenCalled();
  });

  it("BOLSA_CERRADA legacy sin unitsPerBox sigue deduciendo 1 por bolsa (sin regresión)", async () => {
    const tx = makeTx();
    mockedPrisma.$transaction.mockImplementation((cb: any) => cb(tx));
    withVendorBranch();
    tx.product.findFirst.mockResolvedValue({ ...multipackProduct, unitsPerBox: null });
    tx.productStock.findFirst.mockResolvedValue({ id: "ps-1", quantity: 10 });
    tx.productStock.updateMany.mockResolvedValue({ count: 1 });
    tx.sale.create.mockResolvedValue({ id: "s-1", items: [] });
    tx.order.findFirst.mockResolvedValue(null);

    await SaleService.createSale(
      {
        products: [
          { productId: "p-1", name: "Alimento", quantity: 3, price: 4500, category: "x", saleMode: "BOLSA_CERRADA" },
        ],
      },
      ...vendorArgs,
    );

    expect(tx.productStock.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { quantity: { decrement: 3 } } }),
    );
  });

  it("mix caja + unidad en el mismo carrito: 2 líneas distintas y totales correctos", async () => {
    const tx = makeTx();
    mockedPrisma.$transaction.mockImplementation((cb: any) => cb(tx));
    withVendorBranch();
    tx.product.findFirst.mockResolvedValue(multipackProduct);
    tx.productStock.findFirst.mockResolvedValue({ id: "ps-1", quantity: 150 });
    tx.productStock.updateMany.mockResolvedValue({ count: 1 });
    tx.sale.create.mockResolvedValue({ id: "s-1", items: [] });
    tx.order.findFirst.mockResolvedValue(null);

    await SaleService.createSale(
      {
        products: [
          { productId: "p-1", name: "Caja", quantity: 1, price: 18400, category: "x", saleMode: "BOLSA_CERRADA" },
          { productId: "p-1", name: "Unidad", quantity: 3, price: 1226.67, category: "x", saleMode: "POR_UNIDAD" },
        ],
      },
      ...vendorArgs,
    );

    const createCall = tx.sale.create.mock.calls[0][0];
    expect(createCall.data.items.create).toHaveLength(2);
    expect(createCall.data.totalAmount).toBe(22080.01); // round2(1×18400) + round2(3×1226.67)
    // Ambas líneas descuentan del ProductStock: caja −15, unidad −3.
    expect(tx.productStock.updateMany).toHaveBeenCalledTimes(2);
  });
});

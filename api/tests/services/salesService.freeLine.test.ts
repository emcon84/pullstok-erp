/**
 * Tests de salesService para la "Venta libre": una línea ad-hoc (ej. "Hueso
 * molido", 350 g, $2800 total) SIN Product ni celda de planilla. Sin DB:
 * `$transaction` recibe un `tx` mockeado.
 *
 * Contrato: request `{ freeLine: true, name, quantity (kg, <= 3 dec), lineTotal }`.
 * Persistencia sin migración: SaleItem con productId/loosePriceId null,
 * saleMode POR_PESO (kg), category "Venta libre" y price = lineTotal/quantity
 * (snapshot por kg). El total de la línea es EXACTAMENTE round2(lineTotal).
 * Sin stock que validar ni descontar; nunca se crea un Product.
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
  $transaction: jest.Mock;
};
const mockedBase = basePrisma as unknown as { branchAssignment: { findMany: jest.Mock } };

const makeTx = () => ({
  product: { findFirst: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
  productStock: { findFirst: jest.fn(), updateMany: jest.fn() },
  looseStock: { findFirst: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
  priceKgPrice: { findFirst: jest.fn() },
  sale: { create: jest.fn() },
  order: { findFirst: jest.fn(), updateMany: jest.fn() },
});

const vendorArgs: [string, string] = ["u-1", "VENDEDOR"];

const withVendorBranch = () => {
  mockedBase.branchAssignment.findMany.mockResolvedValue([{ branchId: "b-1" }]);
  mockedPrisma.branch.findFirst.mockResolvedValue({ id: "b-1", isActive: true });
  mockedPrisma.cashSession.findFirst.mockResolvedValue({ id: "cs-1", branchId: "b-1", status: "OPEN" });
};

const freeLine = (over: Record<string, unknown> = {}) => ({
  freeLine: true,
  name: "Hueso molido",
  quantity: 0.35, // kg (350 g)
  lineTotal: 2800,
  price: 0,
  ...over,
});

describe("venta libre: línea ad-hoc sin producto", () => {
  beforeEach(() => jest.clearAllMocks());

  it("persiste la línea sin productId/loosePriceId, en kg, con el total tipeado exacto", async () => {
    const tx = makeTx();
    mockedPrisma.$transaction.mockImplementation((cb: any) => cb(tx));
    withVendorBranch();
    tx.sale.create.mockResolvedValue({ id: "s-1", items: [] });
    tx.order.findFirst.mockResolvedValue(null);

    await SaleService.createSale({ products: [freeLine()] }, ...vendorArgs);

    const createCall = tx.sale.create.mock.calls[0][0];
    const stored = createCall.data.items.create[0];
    expect(stored).toEqual({
      productId: null,
      loosePriceId: null,
      name: "Hueso molido",
      quantity: 0.35,
      category: "Venta libre",
      price: 2800 / 0.35,
      saleMode: "POR_PESO",
      piecesPerBlister: null,
    });
    expect(createCall.data.totalAmount).toBe(2800);
  });

  it("no toca stock ni busca/crea ningún Product ni celda", async () => {
    const tx = makeTx();
    mockedPrisma.$transaction.mockImplementation((cb: any) => cb(tx));
    withVendorBranch();
    tx.sale.create.mockResolvedValue({ id: "s-1", items: [] });
    tx.order.findFirst.mockResolvedValue(null);

    await SaleService.createSale({ products: [freeLine()] }, ...vendorArgs);

    expect(tx.product.findFirst).not.toHaveBeenCalled();
    expect(tx.product.create).not.toHaveBeenCalled();
    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(tx.productStock.findFirst).not.toHaveBeenCalled();
    expect(tx.productStock.updateMany).not.toHaveBeenCalled();
    expect(tx.looseStock.findFirst).not.toHaveBeenCalled();
    expect(tx.looseStock.updateMany).not.toHaveBeenCalled();
    expect(tx.priceKgPrice.findFirst).not.toHaveBeenCalled();
  });

  it("el total del cliente (lineTotal) manda; el price del payload se ignora", async () => {
    const tx = makeTx();
    mockedPrisma.$transaction.mockImplementation((cb: any) => cb(tx));
    withVendorBranch();
    tx.sale.create.mockResolvedValue({ id: "s-1", items: [] });
    tx.order.findFirst.mockResolvedValue(null);

    await SaleService.createSale(
      { products: [freeLine({ price: 999999, quantity: 0.123, lineTotal: 1234.56 })] },
      ...vendorArgs,
    );

    expect(tx.sale.create.mock.calls[0][0].data.totalAmount).toBe(1234.56);
  });

  it("combina con descuento % y pagos: Σ payments == total descontado", async () => {
    const tx = makeTx();
    mockedPrisma.$transaction.mockImplementation((cb: any) => cb(tx));
    withVendorBranch();
    tx.sale.create.mockResolvedValue({ id: "s-1", items: [] });
    tx.order.findFirst.mockResolvedValue(null);

    await SaleService.createSale(
      {
        products: [freeLine()],
        discountPct: 10,
        payments: [{ method: "EFECTIVO", amount: 2520 }],
      },
      ...vendorArgs,
    );

    const data = tx.sale.create.mock.calls[0][0].data;
    expect(data.discount).toBe(280);
    expect(data.totalAmount).toBe(2520);
  });

  it("rechaza pagos que no suman el total de la línea libre", async () => {
    const tx = makeTx();
    mockedPrisma.$transaction.mockImplementation((cb: any) => cb(tx));
    withVendorBranch();
    tx.order.findFirst.mockResolvedValue(null);

    await expect(
      SaleService.createSale(
        { products: [freeLine()], payments: [{ method: "EFECTIVO", amount: 100 }] },
        ...vendorArgs,
      ),
    ).rejects.toThrow(/no coincide con el total/i);
  });

  it("también funciona para ADMIN (sin sucursal asignada)", async () => {
    const tx = makeTx();
    mockedPrisma.$transaction.mockImplementation((cb: any) => cb(tx));
    tx.sale.create.mockResolvedValue({ id: "s-1", items: [] });
    tx.order.findFirst.mockResolvedValue(null);

    await SaleService.createSale({ products: [freeLine()] }, "u-admin", "ADMIN");

    expect(tx.sale.create.mock.calls[0][0].data.totalAmount).toBe(2800);
  });

  it.each([
    ["nombre vacío", { name: "   " }],
    ["sin nombre", { name: undefined }],
    ["total 0", { lineTotal: 0 }],
    ["total negativo", { lineTotal: -5 }],
    ["total ausente", { lineTotal: undefined }],
    ["cantidad 0", { quantity: 0 }],
    ["cantidad negativa", { quantity: -1 }],
  ])("rechaza %s (defensa del service)", async (_label, over) => {
    const tx = makeTx();
    mockedPrisma.$transaction.mockImplementation((cb: any) => cb(tx));
    withVendorBranch();
    tx.order.findFirst.mockResolvedValue(null);

    await expect(
      SaleService.createSale({ products: [freeLine(over)] }, ...vendorArgs),
    ).rejects.toThrow(/venta libre/i);
    expect(tx.sale.create).not.toHaveBeenCalled();
  });
});

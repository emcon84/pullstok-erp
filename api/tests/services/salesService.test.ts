import SaleService from "../../src/services/salesService";
import { prisma } from "../../src/config/db";

jest.mock("../../src/config/db", () => ({
  prisma: {
    sale: { findMany: jest.fn() },
    $transaction: jest.fn(),
  },
  basePrisma: {},
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
  sale: { findMany: jest.Mock };
  $transaction: jest.Mock;
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

import {
  canEditBranchStock,
  resolveEffectiveBranch,
  syncHqStock,
} from "../../src/services/stockService";
import { prisma } from "../../src/config/db";

jest.mock("../../src/config/db", () => ({
  prisma: {
    $transaction: jest.fn(),
  },
}));

const mockedTransaction = (
  prisma as unknown as { $transaction: jest.Mock }
).$transaction;

const makeTx = () => ({
  branch: { findFirst: jest.fn() },
  productStock: { findFirst: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
  product: { updateMany: jest.fn() },
});

describe("canEditBranchStock", () => {
  it("ADMIN can edit any branch (even without assignments)", () => {
    expect(canEditBranchStock("ADMIN", null, "b-1")).toBe(true);
    expect(canEditBranchStock("ADMIN", [], "b-1")).toBe(true);
    expect(canEditBranchStock("ADMIN", ["b-2"], "b-1")).toBe(true);
  });

  it("MANAGEMENT can edit any branch", () => {
    expect(canEditBranchStock("MANAGEMENT", ["b-2"], "b-1")).toBe(true);
    expect(canEditBranchStock("MANAGEMENT", null, "b-1")).toBe(true);
  });

  it("VENDEDOR can edit only assigned branches", () => {
    expect(canEditBranchStock("VENDEDOR", ["b-1", "b-3"], "b-1")).toBe(true);
    expect(canEditBranchStock("VENDEDOR", ["b-1", "b-3"], "b-9")).toBe(false);
  });

  it("VENDEDOR without assignments is read-only", () => {
    expect(canEditBranchStock("VENDEDOR", null, "b-1")).toBe(false);
    expect(canEditBranchStock("VENDEDOR", [], "b-1")).toBe(false);
  });

  it("CASHIER can edit only assigned branches", () => {
    expect(canEditBranchStock("CASHIER", ["b-2"], "b-2")).toBe(true);
    expect(canEditBranchStock("CASHIER", ["b-2"], "b-1")).toBe(false);
    expect(canEditBranchStock("CASHIER", null, "b-2")).toBe(false);
  });

  it("EMPLOYEE can never edit", () => {
    expect(canEditBranchStock("EMPLOYEE", ["b-1"], "b-1")).toBe(false);
  });

  it("unknown roles can never edit", () => {
    expect(canEditBranchStock("SUPERADMIN", ["b-1"], "b-1")).toBe(false);
  });
});

describe("resolveEffectiveBranch", () => {
  it("prefers the configured store branch over the HQ branch", () => {
    expect(resolveEffectiveBranch("b-2", "b-hq")).toBe("b-2");
  });

  it("falls back to the HQ branch when no store branch is configured", () => {
    expect(resolveEffectiveBranch(null, "b-hq")).toBe("b-hq");
  });

  it("returns null when neither a store branch nor an HQ branch exists", () => {
    expect(resolveEffectiveBranch(null, null)).toBeNull();
  });
});

describe("syncHqStock", () => {
  const orgId = "org-1";
  const productId = "prod-1";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates the HQ ProductStock row and mirrors Product.quantity when none exists", async () => {
    const tx = makeTx();
    mockedTransaction.mockImplementation((cb: any) => cb(tx));
    tx.branch.findFirst.mockResolvedValue({ id: "hq-1" });
    tx.productStock.findFirst.mockResolvedValue(null);

    await syncHqStock(orgId, productId, 10);

    expect(tx.branch.findFirst).toHaveBeenCalledWith({
      where: { organizationId: orgId, isHeadquarters: true },
      select: { id: true },
    });
    expect(tx.productStock.create).toHaveBeenCalledWith({
      data: { productId, branchId: "hq-1", quantity: 10, organizationId: orgId },
    });
    expect(tx.productStock.updateMany).not.toHaveBeenCalled();
    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { id: productId, organizationId: orgId },
      data: { quantity: 10 },
    });
  });

  it("updates the existing HQ row via updateMany (never upsert) and mirrors Product.quantity", async () => {
    const tx = makeTx();
    mockedTransaction.mockImplementation((cb: any) => cb(tx));
    tx.branch.findFirst.mockResolvedValue({ id: "hq-1" });
    tx.productStock.findFirst.mockResolvedValue({ id: "ps-1", quantity: 3 });

    await syncHqStock(orgId, productId, 25);

    expect(tx.productStock.updateMany).toHaveBeenCalledWith({
      where: { productId, branchId: "hq-1", organizationId: orgId },
      data: { quantity: 25 },
    });
    expect(tx.productStock.create).not.toHaveBeenCalled();
    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { id: productId, organizationId: orgId },
      data: { quantity: 25 },
    });
  });

  it("touches nothing when the org has no HQ branch (legacy Product.quantity stays)", async () => {
    const tx = makeTx();
    mockedTransaction.mockImplementation((cb: any) => cb(tx));
    tx.branch.findFirst.mockResolvedValue(null);

    await syncHqStock(orgId, productId, 10);

    expect(tx.productStock.findFirst).not.toHaveBeenCalled();
    expect(tx.productStock.create).not.toHaveBeenCalled();
    expect(tx.productStock.updateMany).not.toHaveBeenCalled();
    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });
});

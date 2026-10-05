/**
 * presentationsService (sdd/product-presentations). Sin DB: `$transaction`
 * recibe un `tx` mockeado. Dentro de la tx la extensión tenant NO aplica, así
 * que cada query debe llevar organizationId explícito.
 */
import { prisma } from "../../src/config/db";
import {
  replacePresentations,
  enablePresentations,
  disablePresentations,
} from "../../src/services/presentationsService";

jest.mock("../../src/config/db", () => ({
  prisma: { $transaction: jest.fn() },
}));
jest.mock("../../src/config/tenantContext", () => ({
  requireOrganizationId: jest.fn().mockReturnValue("org-1"),
}));

const mockedPrisma = prisma as unknown as { $transaction: jest.Mock };

const makeTx = () => ({
  product: { findFirst: jest.fn(), updateMany: jest.fn() },
  productStock: { findFirst: jest.fn(), updateMany: jest.fn() },
  productPresentation: {
    findMany: jest.fn().mockResolvedValue([]),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
    create: jest.fn().mockResolvedValue({}),
  },
});

let tx: ReturnType<typeof makeTx>;
beforeEach(() => {
  jest.clearAllMocks();
  tx = makeTx();
  mockedPrisma.$transaction.mockImplementation((fn: any) => fn(tx));
});

const input = (o: any) => ({ sortOrder: 0, wholesalePrice: null, isActive: true, price: 10, ...o });
const box = input({ name: "Caja", factor: 10 });
const unit = input({ name: "Unidad", factor: 1 });

const farmacia = { id: "p-1", quantity: 0, hasPresentations: false, category: { name: "FARMACIA" }, presentations: [] as any[] };
const enabled = {
  ...farmacia,
  hasPresentations: true,
  presentations: [
    { id: "pr-unit", name: "Unidad", factor: 1, isActive: true },
    { id: "pr-box", name: "Caja", factor: 10, isActive: true },
  ],
};

const failsWith = async (p: Promise<unknown>, status: number, code: string) => {
  await expect(p).rejects.toMatchObject({ status, code });
};

describe("common guards", () => {
  it("404 when the product is not in the org (query is org-scoped)", async () => {
    tx.product.findFirst.mockResolvedValue(null);
    await failsWith(enablePresentations("p-x", { presentations: [box, unit] }), 404, "PRODUCT_NOT_FOUND");
    expect(tx.product.findFirst.mock.calls[0][0].where).toEqual({ id: "p-x", organizationId: "org-1" });
  });

  it("400 PRESENTATIONS_FARMACIA_ONLY for non-FARMACIA products", async () => {
    tx.product.findFirst.mockResolvedValue({ ...enabled, category: { name: "Balanceados" } });
    await failsWith(replacePresentations("p-1", { presentations: [box, unit] }), 400, "PRESENTATIONS_FARMACIA_ONLY");
    tx.product.findFirst.mockResolvedValue({ ...farmacia, category: null });
    await failsWith(enablePresentations("p-1", { presentations: [box, unit] }), 400, "PRESENTATIONS_FARMACIA_ONLY");
  });
});

describe("enablePresentations", () => {
  beforeEach(() => tx.product.findFirst.mockResolvedValue(farmacia));

  it("creates rows, flags the product and multiplies stock by the largest factor by default", async () => {
    await enablePresentations("p-1", { presentations: [box, unit] });
    expect(tx.productPresentation.create).toHaveBeenCalledTimes(2);
    expect(tx.productPresentation.create.mock.calls[0][0].data).toMatchObject({
      organizationId: "org-1", productId: "p-1", name: "Caja", factor: 10,
    });
    expect(tx.productStock.updateMany).toHaveBeenCalledWith({
      where: { productId: "p-1", organizationId: "org-1" },
      data: { quantity: { multiply: 10 } },
    });
    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { id: "p-1", organizationId: "org-1" },
      data: { hasPresentations: true, quantity: { multiply: 10 } },
    });
  });

  it("uses stockCountedIn (by name) when given", async () => {
    await enablePresentations("p-1", { presentations: [box, unit], stockCountedIn: "unidad" });
    expect(tx.productStock.updateMany).not.toHaveBeenCalled(); // factor 1 → no-op
    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { id: "p-1", organizationId: "org-1" },
      data: { hasPresentations: true },
    });
  });

  it("400 when stockCountedIn is not in the set", async () => {
    await failsWith(enablePresentations("p-1", { presentations: [box, unit], stockCountedIn: "Pallet" }), 400, "PRESENTATION_COUNTED_IN_INVALID");
  });

  it("409 when already enabled", async () => {
    tx.product.findFirst.mockResolvedValue(enabled);
    await failsWith(enablePresentations("p-1", { presentations: [box, unit] }), 409, "PRESENTATIONS_ALREADY_ENABLED");
  });

  it("rejects an invalid set without writing", async () => {
    await failsWith(enablePresentations("p-1", { presentations: [box] }), 400, "PRESENTATION_BASE_REQUIRED");
    expect(tx.productPresentation.create).not.toHaveBeenCalled();
    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });
});

describe("replacePresentations", () => {
  beforeEach(() => tx.product.findFirst.mockResolvedValue(enabled));

  it("updates by id, creates new and deletes missing, all org-scoped", async () => {
    const pallet = input({ name: "Blister", factor: 5 });
    await replacePresentations("p-1", {
      presentations: [{ ...unit, id: "pr-unit", name: "Unidad" }, pallet],
    });
    expect(tx.productPresentation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "pr-unit", productId: "p-1", organizationId: "org-1" } }),
    );
    expect(tx.productPresentation.create.mock.calls[0][0].data).toMatchObject({ name: "Blister", organizationId: "org-1" });
    expect(tx.productPresentation.deleteMany).toHaveBeenCalledWith({
      where: { productId: "p-1", organizationId: "org-1", id: { notIn: ["pr-unit"] } },
    });
  });

  it("409 PRESENTATIONS_NOT_ENABLED on a product without presentations", async () => {
    tx.product.findFirst.mockResolvedValue(farmacia);
    await failsWith(replacePresentations("p-1", { presentations: [box, unit] }), 409, "PRESENTATIONS_NOT_ENABLED");
  });

  it("rejects removing the base presentation", async () => {
    const other = input({ name: "Pieza", factor: 1 });
    await failsWith(
      replacePresentations("p-1", { presentations: [{ ...box, id: "pr-box" }, other] }),
      400, "PRESENTATION_BASE_LOCKED",
    );
    expect(tx.productPresentation.deleteMany).not.toHaveBeenCalled();
  });

  it("rejects deactivating or changing the factor of the base", async () => {
    await failsWith(
      replacePresentations("p-1", { presentations: [{ ...box, id: "pr-box" }, { ...unit, id: "pr-unit", isActive: false }] }),
      400, "PRESENTATION_BASE_REQUIRED",
    );
    await failsWith(
      replacePresentations("p-1", { presentations: [{ ...unit, id: "pr-unit", factor: 2 }, { ...input({ name: "X", factor: 1 }) }] }),
      400, "PRESENTATION_BASE_LOCKED",
    );
  });

  it("rejects ids that do not belong to the product", async () => {
    await failsWith(
      replacePresentations("p-1", { presentations: [{ ...unit, id: "pr-unit" }, { ...box, id: "foreign" }] }),
      400, "PRESENTATION_NOT_FOUND",
    );
  });

  it("allows renaming the base", async () => {
    await expect(
      replacePresentations("p-1", { presentations: [{ ...unit, id: "pr-unit", name: "Pieza" }] }),
    ).resolves.toBeDefined();
  });
});

describe("disablePresentations", () => {
  beforeEach(() => tx.product.findFirst.mockResolvedValue(enabled));

  it("409 PRESENTATION_STOCK_NOT_ZERO when a branch still has stock", async () => {
    tx.productStock.findFirst.mockResolvedValue({ id: "ps-1" });
    await failsWith(disablePresentations("p-1"), 409, "PRESENTATION_STOCK_NOT_ZERO");
    expect(tx.productStock.findFirst.mock.calls[0][0].where).toEqual({
      productId: "p-1", organizationId: "org-1", quantity: { gt: 0 },
    });
  });

  it("409 when the legacy Product.quantity is > 0", async () => {
    tx.product.findFirst.mockResolvedValue({ ...enabled, quantity: 3 });
    tx.productStock.findFirst.mockResolvedValue(null);
    await failsWith(disablePresentations("p-1"), 409, "PRESENTATION_STOCK_NOT_ZERO");
  });

  it("clears the flag and deactivates every presentation when stock is zero", async () => {
    tx.productStock.findFirst.mockResolvedValue(null);
    await disablePresentations("p-1");
    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { id: "p-1", organizationId: "org-1" },
      data: { hasPresentations: false },
    });
    expect(tx.productPresentation.updateMany).toHaveBeenCalledWith({
      where: { productId: "p-1", organizationId: "org-1" },
      data: { isActive: false },
    });
  });

  it("409 PRESENTATIONS_NOT_ENABLED when not enabled", async () => {
    tx.product.findFirst.mockResolvedValue(farmacia);
    await failsWith(disablePresentations("p-1"), 409, "PRESENTATIONS_NOT_ENABLED");
  });
});

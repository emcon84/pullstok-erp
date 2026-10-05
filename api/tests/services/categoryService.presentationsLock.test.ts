/**
 * sdd/product-presentations: la categoría FARMACIA no se puede renombrar ni
 * borrar mientras algún producto de ella tenga presentaciones habilitadas.
 */
import CategoryService from "../../src/services/categoryService";
import { prisma } from "../../src/config/db";

jest.mock("../../src/config/db", () => ({
  prisma: {
    category: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
    },
    product: { findFirst: jest.fn(), updateMany: jest.fn() },
    categoryVariantDefinition: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
  },
}));
jest.mock("../../src/config/tenantContext", () => ({
  requireOrganizationId: jest.fn().mockReturnValue("org-1"),
}));

const db = prisma as unknown as {
  category: Record<string, jest.Mock>;
  product: Record<string, jest.Mock>;
};

beforeEach(() => {
  jest.clearAllMocks();
  db.category.updateMany.mockResolvedValue({ count: 1 });
  db.category.deleteMany.mockResolvedValue({ count: 1 });
});

const locked = { status: 409, code: "PRESENTATIONS_CATEGORY_LOCKED" };

describe("rename", () => {
  it("409 when renaming FARMACIA away while a product has presentations", async () => {
    db.category.findFirst.mockResolvedValue({ name: "FARMACIA" });
    db.product.findFirst.mockResolvedValue({ id: "p-1" });
    await expect(CategoryService.rename("c-1", { name: "Medicamentos" })).rejects.toMatchObject(locked);
    expect(db.product.findFirst).toHaveBeenCalledWith({
      where: { categoryId: "c-1", hasPresentations: true },
      select: { id: true },
    });
    expect(db.category.updateMany).not.toHaveBeenCalled();
  });

  it("allows the rename when no product has presentations", async () => {
    db.category.findFirst.mockResolvedValue({ name: "FARMACIA" });
    db.product.findFirst.mockResolvedValue(null);
    await CategoryService.rename("c-1", { name: "Medicamentos" });
    expect(db.category.updateMany).toHaveBeenCalled();
  });

  it("does not check products for non-FARMACIA categories or case-only renames", async () => {
    db.category.findFirst.mockResolvedValue({ name: "Balanceados" });
    await CategoryService.rename("c-2", { name: "Otro" });
    db.category.findFirst.mockResolvedValue({ name: "FARMACIA" });
    await CategoryService.rename("c-1", { name: "Farmacia" });
    expect(db.product.findFirst).not.toHaveBeenCalled();
  });
});

describe("remove", () => {
  it("409 when a product in the category has presentations", async () => {
    db.product.findFirst.mockResolvedValue({ id: "p-1" });
    await expect(CategoryService.remove("c-1")).rejects.toMatchObject(locked);
    expect(db.product.updateMany).not.toHaveBeenCalled();
    expect(db.category.deleteMany).not.toHaveBeenCalled();
  });
});

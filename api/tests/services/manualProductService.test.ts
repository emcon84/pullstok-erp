import { prisma } from "../../src/config/db";
import {
  MANUAL_CATEGORY_NAME,
  ManualProductError,
  createManualProduct,
  listManualProducts,
  promoteManualProduct,
} from "../../src/services/manualProductService";

jest.mock("../../src/config/db", () => ({
  prisma: {
    category: { findFirst: jest.fn(), create: jest.fn() },
    product: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
  },
  basePrisma: {},
}));

jest.mock("../../src/config/tenantContext", () => ({
  requireOrganizationId: jest.fn().mockReturnValue("org-1"),
}));

const mockedPrisma = prisma as unknown as {
  category: { findFirst: jest.Mock; create: jest.Mock };
  product: {
    create: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    updateMany: jest.Mock;
  };
};

const manualCategory = { id: "cat-manual", name: MANUAL_CATEGORY_NAME, parentId: null };

describe("manualProductService.createManualProduct", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedPrisma.product.create.mockImplementation(async ({ data }: any) => ({
      id: "prod-1",
      ...data,
      category: { id: data.categoryId, name: MANUAL_CATEGORY_NAME },
    }));
  });

  it("reusa la categoría raíz 'Carga manual' si ya existe (no crea otra)", async () => {
    mockedPrisma.category.findFirst.mockResolvedValue(manualCategory);

    await createManualProduct({ name: "Correa", price: 1500 });

    expect(mockedPrisma.category.findFirst).toHaveBeenCalledWith({
      where: { name: MANUAL_CATEGORY_NAME, parentId: null },
    });
    expect(mockedPrisma.category.create).not.toHaveBeenCalled();
  });

  it("crea la categoría raíz 'Carga manual' si no existe", async () => {
    mockedPrisma.category.findFirst.mockResolvedValue(null);
    mockedPrisma.category.create.mockResolvedValue(manualCategory);

    await createManualProduct({ name: "Correa", price: 1500 });

    expect(mockedPrisma.category.create).toHaveBeenCalledWith({
      data: { name: MANUAL_CATEGORY_NAME, parentId: null, organizationId: "org-1" },
    });
    expect(mockedPrisma.product.create.mock.calls[0][0].data.categoryId).toBe(
      "cat-manual",
    );
  });

  it("crea el producto con isManual=true, quantity=0, no publicado, no carried y nombre normalizado", async () => {
    mockedPrisma.category.findFirst.mockResolvedValue(manualCategory);

    const result = await createManualProduct({ name: "  correa   larga ", price: 1500 });

    const args = mockedPrisma.product.create.mock.calls[0][0];
    expect(args.data).toEqual({
      name: "CORREA LARGA",
      price: 1500,
      quantity: 0,
      isManual: true,
      publishedToStore: false,
      carried: false,
      categoryId: "cat-manual",
      organizationId: "org-1",
    });
    // La respuesta trae la categoría para que el POS pueda armar la línea.
    expect(args.include).toEqual({ category: { select: { id: true, name: true } } });
    expect(result).toMatchObject({
      id: "prod-1",
      name: "CORREA LARGA",
      price: 1500,
      quantity: 0,
      category: { id: "cat-manual", name: MANUAL_CATEGORY_NAME },
    });
  });
});

describe("manualProductService.listManualProducts", () => {
  beforeEach(() => jest.clearAllMocks());

  it("lista solo productos isManual=true, con categoría, ordenados por nombre", async () => {
    mockedPrisma.product.findMany.mockResolvedValue([{ id: "p1" }]);

    const result = await listManualProducts();

    expect(mockedPrisma.product.findMany).toHaveBeenCalledWith({
      where: { isManual: true },
      include: { category: { select: { id: true, name: true } } },
      orderBy: { name: "asc" },
    });
    expect(result).toEqual([{ id: "p1" }]);
  });
});

describe("manualProductService.promoteManualProduct", () => {
  beforeEach(() => jest.clearAllMocks());

  const realCategory = { id: "cat-real", name: "Alimento Seco", parentId: null };

  it("pasa el producto a isManual=false con la categoría real elegida", async () => {
    mockedPrisma.category.findFirst.mockResolvedValue(realCategory);
    mockedPrisma.product.updateMany.mockResolvedValue({ count: 1 });
    mockedPrisma.product.findFirst.mockResolvedValue({ id: "p1", isManual: false });

    const result = await promoteManualProduct("p1", "cat-real");

    expect(mockedPrisma.product.updateMany).toHaveBeenCalledWith({
      where: { id: "p1", isManual: true },
      data: { isManual: false, categoryId: "cat-real" },
    });
    expect(mockedPrisma.product.findFirst).toHaveBeenCalledWith({
      where: { id: "p1" },
      include: { category: { select: { id: true, name: true } } },
    });
    expect(result).toEqual({ id: "p1", isManual: false });
  });

  it("400 si la categoría no existe en la org", async () => {
    mockedPrisma.category.findFirst.mockResolvedValue(null);

    await expect(promoteManualProduct("p1", "cat-x")).rejects.toMatchObject({
      status: 400,
    });
    expect(mockedPrisma.product.updateMany).not.toHaveBeenCalled();
  });

  it("400 si la categoría destino es la propia 'Carga manual'", async () => {
    mockedPrisma.category.findFirst.mockResolvedValue(manualCategory);

    const err = await promoteManualProduct("p1", "cat-manual").catch((e) => e);

    expect(err).toBeInstanceOf(ManualProductError);
    expect(err.status).toBe(400);
    expect(mockedPrisma.product.updateMany).not.toHaveBeenCalled();
  });

  it("404 si el producto no existe o no es manual (count 0)", async () => {
    mockedPrisma.category.findFirst.mockResolvedValue(realCategory);
    mockedPrisma.product.updateMany.mockResolvedValue({ count: 0 });

    await expect(promoteManualProduct("p-x", "cat-real")).rejects.toMatchObject({
      status: 404,
    });
    expect(mockedPrisma.product.findFirst).not.toHaveBeenCalled();
  });
});

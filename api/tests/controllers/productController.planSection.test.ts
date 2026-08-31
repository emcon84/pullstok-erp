import { Request, Response } from "express";
import productController, {
  planTitleWhereCandidates,
} from "../../src/controllers/productController";
import { prisma } from "../../src/config/db";

jest.mock("../../src/config/db", () => ({
  prisma: {
    product: { findMany: jest.fn(), count: jest.fn() },
    category: { findFirst: jest.fn(), findMany: jest.fn() },
    categoryVariantOption: { findMany: jest.fn() },
    productVariant: { createMany: jest.fn(), deleteMany: jest.fn() },
    branch: { findMany: jest.fn(), findFirst: jest.fn() },
    productStock: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
    },
    priceListEntry: { findMany: jest.fn() },
    $transaction: jest.fn(),
  },
  basePrisma: {},
}));

jest.mock("../../src/config/tenantContext", () => ({
  requireOrganizationId: jest.fn().mockReturnValue("org-1"),
}));

jest.mock("../../src/services/priceLooseService", () => ({
  recomputeForProduct: jest.fn().mockResolvedValue({ affected: 0, priceKgSuelto: null }),
  recomputeForBulkPriceUpdate: jest.fn().mockResolvedValue({ affected: 0 }),
  recomputeForCsvImport: jest.fn().mockResolvedValue({ affected: 0 }),
}));

jest.mock("../../src/services/stockService", () => ({
  syncHqStock: jest.fn(),
  canEditBranchStock: jest.fn().mockReturnValue(true),
  getStockSummary: jest.fn().mockResolvedValue({ total: 0, branches: [] }),
}));

const mockedPrisma = prisma as unknown as {
  product: { findMany: jest.Mock; count: jest.Mock };
  category: { findMany: jest.Mock };
  priceListEntry: { findMany: jest.Mock };
  branch: { findMany: jest.Mock; findFirst: jest.Mock };
  productStock: { findMany: jest.Mock };
};

const mockResponse = () => {
  const res = {} as Response & { json: jest.Mock; status: jest.Mock };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const query = (q: Record<string, unknown> = {}) =>
  ({ query: q } as unknown as Request);

describe("productController.getProducts — planSection y filtro por título", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("incluye planSection con brand/line/subline/position de la planilla SECO más reciente", async () => {
    mockedPrisma.product.findMany.mockResolvedValue([
      {
        id: "p-1",
        name: "SIEGER Puppy Mini x 1 Kg.",
        price: 10642,
        priceListEntries: [
          {
            section: {
              brand: "SIEGER",
              line: "SUPER PREMIUM PARA PERROS",
              subline: "SIEGER PUPPY",
              position: 2,
            },
          },
        ],
      },
      {
        id: "p-2",
        name: "Collar Suelto",
        price: 500,
        priceListEntries: [],
      },
    ]);

    const req = query();
    const res = mockResponse();

    await productController.getProducts(req, res);

    const callArgs = mockedPrisma.product.findMany.mock.calls[0][0];
    expect(callArgs.include.priceListEntries).toEqual({
      where: { matched: true, section: { priceList: { type: "SECO" } } },
      orderBy: { section: { priceList: { period: "desc" } } },
      take: 1,
      select: {
        section: {
          select: { brand: true, line: true, subline: true, position: true },
        },
      },
    });

    expect(res.json).toHaveBeenCalledWith([
      {
        id: "p-1",
        name: "SIEGER Puppy Mini x 1 Kg.",
        price: 10642,
        unitsPerBox: null,
        perUnitPrice: null,
        planSection: {
          brand: "SIEGER",
          line: "SUPER PREMIUM PARA PERROS",
          subline: "SIEGER PUPPY",
          position: 2,
        },
      },
      { id: "p-2", name: "Collar Suelto", price: 500, unitsPerBox: null, perUnitPrice: null, planSection: null },
    ]);
  });

  it("no expone precios de proveedor ni el array priceListEntries crudo", async () => {
    mockedPrisma.product.findMany.mockResolvedValue([
      {
        id: "p-1",
        name: "SIEGER Puppy",
        price: 10642,
        priceListEntries: [
          {
            priceSinIva: 8795,
            priceConIva: 10642,
            suggestedPrice: 14190,
            section: { brand: "SIEGER", subline: "SIEGER PUPPY", position: 1 },
          },
        ],
      },
    ]);

    const res = mockResponse();
    await productController.getProducts(query(), res);

    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body[0]).not.toHaveProperty("priceListEntries");
    expect(body[0]).not.toHaveProperty("priceSinIva");
    expect(body[0]).not.toHaveProperty("priceConIva");
    expect(body[0]).not.toHaveProperty("suggestedPrice");
    expect(body[0].planSection).toEqual({
      brand: "SIEGER",
      subline: "SIEGER PUPPY",
      position: 1,
    });
  });

  it("aplica el filtro ?title= como some sobre entries matcheadas de planilla SECO", async () => {
    mockedPrisma.product.findMany.mockResolvedValue([{ id: "p-1", name: "X" }]);

    const req = query({ title: "SIEGER|SUPER PREMIUM PARA PERROS|SIEGER PUPPY" });
    const res = mockResponse();

    await productController.getProducts(req, res);

    const callArgs = mockedPrisma.product.findMany.mock.calls[0][0];
    expect(callArgs.where.priceListEntries).toEqual({
      some: {
        matched: true,
        section: {
          priceList: { type: "SECO" },
          OR: [
            {
              brand: "SIEGER",
              line: "SUPER PREMIUM PARA PERROS",
              subline: "SIEGER PUPPY",
            },
          ],
        },
      },
    });
  });

  it("un título de 2 partes matchea brand|line y brand|subline (campos sobrantes a null)", async () => {
    mockedPrisma.product.findMany.mockResolvedValue([]);

    const req = query({ title: "MAXXIUM|PERROS" });
    const res = mockResponse();

    await productController.getProducts(req, res);

    const callArgs = mockedPrisma.product.findMany.mock.calls[0][0];
    expect(callArgs.where.priceListEntries.some.section.OR).toEqual([
      { brand: "MAXXIUM", line: "PERROS", subline: null },
      { brand: "MAXXIUM", line: null, subline: "PERROS" },
      { brand: null, line: "MAXXIUM", subline: "PERROS" },
    ]);
  });

  it("una clave sin partes válidas devuelve vacío sin matchear nada", async () => {
    mockedPrisma.product.findMany.mockResolvedValue([]);

    const req = query({ title: "||||" });
    const res = mockResponse();

    await productController.getProducts(req, res);

    const callArgs = mockedPrisma.product.findMany.mock.calls[0][0];
    expect(callArgs.where.priceListEntries).toBeUndefined();
    expect(callArgs.where.id).toBe("__no-match__");
  });

  it("mapea planSection también en la rama paginada (page/pageSize)", async () => {
    mockedPrisma.product.findMany.mockResolvedValue([
      { id: "p-1", name: "X", price: 100, priceListEntries: [] },
    ]);
    mockedPrisma.product.count.mockResolvedValue(1);

    const req = query({ page: "1", pageSize: "30" });
    const res = mockResponse();

    await productController.getProducts(req, res);

    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.items[0].planSection).toBeNull();
    expect(body.items[0]).not.toHaveProperty("priceListEntries");
    expect(body.total).toBe(1);
  });

  it("?priceListType=WET filtra por pertenencia a la planilla WET y usa type WET en el include", async () => {
    mockedPrisma.product.findMany.mockResolvedValue([{ id: "p-1", name: "X" }]);

    const req = query({ priceListType: "WET" });
    const res = mockResponse();

    await productController.getProducts(req, res);

    const callArgs = mockedPrisma.product.findMany.mock.calls[0][0];
    expect(callArgs.where.priceListEntries).toEqual({
      some: {
        matched: true,
        section: { priceList: { type: "WET" } },
      },
    });
    expect(callArgs.include.priceListEntries.where).toEqual({
      matched: true,
      section: { priceList: { type: "WET" } },
    });
  });

  it("?priceListType=WET&title=<key> usa WET en el filtro por título y en la pertenencia (AND)", async () => {
    mockedPrisma.product.findMany.mockResolvedValue([{ id: "p-1", name: "X" }]);

    const req = query({ priceListType: "WET", title: "MAXXIUM|PERROS" });
    const res = mockResponse();

    await productController.getProducts(req, res);

    const callArgs = mockedPrisma.product.findMany.mock.calls[0][0];
    expect(callArgs.where.priceListEntries).toEqual({
      some: {
        AND: [
          {
            matched: true,
            section: {
              priceList: { type: "WET" },
              OR: [
                { brand: "MAXXIUM", line: "PERROS", subline: null },
                { brand: "MAXXIUM", line: null, subline: "PERROS" },
                { brand: null, line: "MAXXIUM", subline: "PERROS" },
              ],
            },
          },
          { matched: true, section: { priceList: { type: "WET" } } },
        ],
      },
    });
    expect(callArgs.include.priceListEntries.where.section.priceList.type).toBe("WET");
  });

  it("priceListType inválido → 400 con mensaje claro y sin consultar", async () => {
    const req = query({ priceListType: "HUMEDO" });
    const res = mockResponse();

    await productController.getProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("Tipo de planilla inválido"),
      }),
    );
    expect(mockedPrisma.product.findMany).not.toHaveBeenCalled();
  });

  it("priceListType inválido también respeta la rama paginada (400 antes de contar)", async () => {
    const req = query({ page: "1", pageSize: "30", priceListType: "SECO,WET" });
    const res = mockResponse();

    await productController.getProducts(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockedPrisma.product.count).not.toHaveBeenCalled();
  });
});

describe("productController.getProductFilterFacets — títulos de planilla", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("incluye titles con key, label y count de productos distintos, ordenados por position", async () => {
    mockedPrisma.category.findMany.mockResolvedValue([]);
    mockedPrisma.priceListEntry.findMany.mockResolvedValue([
      {
        productId: "p-1",
        section: {
          brand: "SIEGER",
          line: "SUPER PREMIUM PARA PERROS",
          subline: "SIEGER PUPPY",
          position: 2,
        },
      },
      {
        productId: "p-2",
        section: {
          brand: "SIEGER",
          line: "SUPER PREMIUM PARA PERROS",
          subline: "SIEGER PUPPY",
          position: 2,
        },
      },
      {
        productId: "p-1",
        section: {
          brand: "MAXXIUM",
          line: null,
          subline: "MAXXIUM PERROS",
          position: 5,
        },
      },
      {
        productId: "p-3",
        section: { brand: "SIEGER", line: null, subline: null, position: 1 },
      },
      // Sin marca ni sublínea: no genera título (misma regla que el front).
      {
        productId: "p-4",
        section: { brand: null, line: "LÍNEA SUELTA", subline: null, position: 9 },
      },
    ]);

    const res = mockResponse();
    await productController.getProductFilterFacets(query(), res);

    const callArgs = mockedPrisma.priceListEntry.findMany.mock.calls[0][0];
    expect(callArgs.where).toEqual({
      matched: true,
      productId: { not: null },
      section: { priceList: { organizationId: "org-1", type: "SECO" } },
    });

    expect(res.json).toHaveBeenCalledWith({
      categories: [],
      variants: [],
      titles: [
        {
          key: "SIEGER",
          label: "SIEGER",
          count: 1,
        },
        {
          key: "SIEGER|SUPER PREMIUM PARA PERROS|SIEGER PUPPY",
          label: "SIEGER PUPPY",
          count: 2,
        },
        {
          key: "MAXXIUM|MAXXIUM PERROS",
          label: "MAXXIUM PERROS",
          count: 1,
        },
      ],
    });
  });

  it("resuelve el scope por org en la consulta de entries (PriceList no es tenant model)", async () => {
    mockedPrisma.category.findMany.mockResolvedValue([]);
    mockedPrisma.product.findMany.mockResolvedValue([]);
    mockedPrisma.priceListEntry.findMany.mockResolvedValue([]);

    const res = mockResponse();
    await productController.getProductFilterFacets(query({ category: "Accesorios" }), res);

    const where = mockedPrisma.priceListEntry.findMany.mock.calls[0][0].where;
    expect(where.section.priceList.organizationId).toBe("org-1");
    expect(where.section.priceList.type).toBe("SECO");
  });

  it("?priceListType=WET filtra entries por type WET y devuelve titles vacíos (planilla plana)", async () => {
    mockedPrisma.category.findMany.mockResolvedValue([]);
    mockedPrisma.priceListEntry.findMany.mockResolvedValue([
      {
        productId: "p-1",
        section: { brand: null, line: null, subline: null, position: 1 },
      },
      {
        productId: "p-2",
        section: { brand: null, line: null, subline: null, position: 1 },
      },
    ]);

    const res = mockResponse();
    await productController.getProductFilterFacets(query({ priceListType: "WET" }), res);

    const callArgs = mockedPrisma.priceListEntry.findMany.mock.calls[0][0];
    expect(callArgs.where).toEqual({
      matched: true,
      productId: { not: null },
      section: { priceList: { organizationId: "org-1", type: "WET" } },
    });

    // La sección plana de WET (sin brand ni subline) no genera títulos: la
    // regla `if (!s.brand && !s.subline) continue` la descarta → titles [].
    expect(res.json).toHaveBeenCalledWith({
      categories: [],
      variants: [],
      titles: [],
    });
  });

  it("priceListType inválido en facets → 400 sin consultar entries", async () => {
    const res = mockResponse();
    await productController.getProductFilterFacets(query({ priceListType: "MOJADO" }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("Tipo de planilla inválido"),
      }),
    );
    expect(mockedPrisma.priceListEntry.findMany).not.toHaveBeenCalled();
  });
});

describe("planTitleWhereCandidates — parse de la clave compuesta", () => {
  it("1 parte → solo brand", () => {
    expect(planTitleWhereCandidates("SIEGER")).toEqual([
      { brand: "SIEGER", line: null, subline: null },
    ]);
  });

  it("2 partes → las 3 asignaciones posibles en orden", () => {
    expect(planTitleWhereCandidates("A|B")).toEqual([
      { brand: "A", line: "B", subline: null },
      { brand: "A", line: null, subline: "B" },
      { brand: null, line: "A", subline: "B" },
    ]);
  });

  it("3 partes → brand, line, subline", () => {
    expect(planTitleWhereCandidates("SIEGER|SUPER PREMIUM PARA PERROS|SIEGER PUPPY")).toEqual([
      { brand: "SIEGER", line: "SUPER PREMIUM PARA PERROS", subline: "SIEGER PUPPY" },
    ]);
  });

  it("más de 3 partes o vacío → sin candidatos", () => {
    expect(planTitleWhereCandidates("a|b|c|d")).toEqual([]);
    expect(planTitleWhereCandidates("")).toEqual([]);
    expect(planTitleWhereCandidates("|||")).toEqual([]);
  });

  it("normaliza espacios alrededor de las partes", () => {
    expect(planTitleWhereCandidates("SIEGER | SUPER PREMIUM PARA PERROS | SIEGER PUPPY")).toEqual([
      { brand: "SIEGER", line: "SUPER PREMIUM PARA PERROS", subline: "SIEGER PUPPY" },
    ]);
  });
});
import { Request, Response } from "express";
import productController, {
  computeNewPrice,
  resolveCategoryScope,
  buildBulkPriceWhere,
  buildCategoryParentMap,
  resolveEffectivePercentage,
  resolveSectionProductIds,
  BULK_UPDATE_MAX,
} from "../../src/controllers/productController";
import { prisma } from "../../src/config/db";

// The controller module imports prisma/config/services at load time; the
// helpers under test only touch a `tx` object passed by the caller, but the
// module graph must still resolve. Mock the DB + tenant context like
// productController.branchFilter.test.ts does.
jest.mock("../../src/config/db", () => ({
  prisma: {
    product: { findMany: jest.fn() },
    category: { findMany: jest.fn() },
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

jest.mock("../../src/services/productsService", () => ({
  bulkAddProducts: jest.fn(),
  resolveCategoryId: jest.fn(),
}));

jest.mock("../../src/services/stockService", () => ({
  syncHqStock: jest.fn(),
  canEditBranchStock: jest.fn().mockReturnValue(true),
  getStockSummary: jest.fn().mockResolvedValue({ total: 0, branches: [] }),
}));

describe("computeNewPrice — signed percentage with clamp and 2-decimal rounding", () => {
  it("applies +10% to 10.00 → 11.00", () => {
    expect(computeNewPrice(10, 10)).toBe(11);
  });

  it("applies -20% to 50.00 → 40.00", () => {
    expect(computeNewPrice(50, -20)).toBe(40);
  });

  it("clamps -100% of 25.00 → 0.00 (never negative)", () => {
    expect(computeNewPrice(25, -100)).toBe(0);
  });

  it("rounds to 2 decimals (33.33 * 1.15 → 38.33)", () => {
    expect(computeNewPrice(33.33, 15)).toBe(38.33);
  });

  it("rounds up correctly (19.99 * 1.10 → 21.99)", () => {
    expect(computeNewPrice(19.99, 10)).toBe(21.99);
  });
});

describe("resolveCategoryScope — subtree expansion over the org tree", () => {
  const mockTx = {
    category: { findMany: jest.fn() },
  };

  const cats = [
    { id: "a", parentId: null },
    { id: "b", parentId: "a" },
    { id: "c", parentId: "b" },
    { id: "d", parentId: null },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockTx.category.findMany.mockResolvedValue(cats);
  });

  it("expands a selected parent to itself and ALL descendants (A → A,B,C)", async () => {
    const result = await resolveCategoryScope(mockTx as any, ["a"]);
    expect(result).toEqual(["a", "b", "c"]);
  });

  it("expands a leaf to exactly itself (C → C, no A/B)", async () => {
    const result = await resolveCategoryScope(mockTx as any, ["c"]);
    expect(result).toEqual(["c"]);
  });

  it("unions multiple selected nodes without double-counting ([A, C] → A,B,C)", async () => {
    const result = await resolveCategoryScope(mockTx as any, ["a", "c"]);
    expect(result).toEqual(["a", "b", "c"]);
  });

  it("returns an empty scope for an empty input without querying the DB", async () => {
    const result = await resolveCategoryScope(mockTx as any, []);
    expect(result).toEqual([]);
    expect(mockTx.category.findMany).not.toHaveBeenCalled();
  });

  it("tolerates unknown ids (no throw, no descendants resolved)", async () => {
    const result = await resolveCategoryScope(mockTx as any, ["unknown-id"]);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("unknown-id");
  });
});

describe("buildBulkPriceWhere — brand + optional category/exclude filters", () => {
  it("always filters by brand (some option.value in brandValues, variant name Marca)", () => {
    const where = buildBulkPriceWhere(["Acme"], [], []);
    expect(where.variantAssignments).toEqual({
      some: {
        option: {
          value: { in: ["Acme"] },
          variant: { name: "Marca" },
        },
      },
    });
  });

  it("adds categoryId in-filter only when the expanded set is non-empty", () => {
    const where = buildBulkPriceWhere(["Acme"], ["a", "b"], []);
    expect(where.categoryId).toEqual({ in: ["a", "b"] });
  });

  it("omits categoryId when the expanded set is empty (brand-only scope)", () => {
    const where = buildBulkPriceWhere(["Acme"], [], []);
    expect(where.categoryId).toBeUndefined();
  });

  it("adds id notIn only when excludeProductIds is non-empty", () => {
    const where = buildBulkPriceWhere(["Acme"], [], ["p-1", "p-2"]);
    expect(where.id).toEqual({ notIn: ["p-1", "p-2"] });
  });

  it("omits id when excludeProductIds is empty", () => {
    const where = buildBulkPriceWhere(["Acme"], ["a"], []);
    expect(where.id).toBeUndefined();
  });

  it("never filters by publishedToStore (all matching products, incl. unpublished)", () => {
    const where = buildBulkPriceWhere(["Acme"], ["a"], ["p-1"]);
    expect(where.publishedToStore).toBeUndefined();
  });
});

describe("buildBulkPriceWhere — providerIds (sdd/alican-wholesale-price-list/providers)", () => {
  it("adds providerId in-filter when providerIds is non-empty (AND with the brand filter)", () => {
    const where = buildBulkPriceWhere(["Acme"], [], [], ["prov-1", "prov-2"]);
    expect(where.providerId).toEqual({ in: ["prov-1", "prov-2"] });
    // El filtro de marcas sigue presente: se combina como AND.
    expect(where.variantAssignments).toBeDefined();
  });

  it("omits providerId when providerIds is empty/omitted (back-compat)", () => {
    const where = buildBulkPriceWhere(["Acme"], [], []);
    expect(where.providerId).toBeUndefined();
    expect(buildBulkPriceWhere(["Acme"], [], [], []).providerId).toBeUndefined();
  });

  it("combines providerIds with category and exclude filters as AND", () => {
    const where = buildBulkPriceWhere(["Acme"], ["cat-1"], ["p-1"], ["prov-1"]);
    expect(where.providerId).toEqual({ in: ["prov-1"] });
    expect(where.categoryId).toEqual({ in: ["cat-1"] });
    expect(where.id).toEqual({ notIn: ["p-1"] });
  });
});

describe("buildBulkPriceWhere — sectionProductIds (línea de planilla del proveedor)", () => {
  it("adds id in-filter when sectionProductIds is non-empty", () => {
    const where = buildBulkPriceWhere(["Acme"], [], [], [], ["sec-1", "sec-2"]);
    expect(where.id).toEqual({ in: ["sec-1", "sec-2"] });
  });

  it("combines id { in, notIn } when both sections and exclusions are present", () => {
    const where = buildBulkPriceWhere(["Acme"], [], ["p-9"], [], ["sec-1"]);
    expect(where.id).toEqual({ in: ["sec-1"], notIn: ["p-9"] });
  });

  it("omits id when sectionProductIds is empty/omitted (back-compat)", () => {
    expect(buildBulkPriceWhere(["Acme"], [], [], []).id).toBeUndefined();
    expect(buildBulkPriceWhere(["Acme"], [], [], [], []).id).toBeUndefined();
  });

  it("keeps the brand filter when sections are present (AND)", () => {
    const where = buildBulkPriceWhere(["Acme"], [], [], [], ["sec-1"]);
    expect(where.variantAssignments).toBeDefined();
  });
});

describe("resolveSectionProductIds — productIds de secciones con anti-fuga y dedupe", () => {
  const mockTx = {
    priceListEntry: { findMany: jest.fn() },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns [] without querying the DB when sectionIds is empty", async () => {
    const result = await resolveSectionProductIds(mockTx as any, "org-1", []);
    expect(result).toEqual([]);
    expect(mockTx.priceListEntry.findMany).not.toHaveBeenCalled();
  });

  it("queries entries scoped by org and returns deduped productIds", async () => {
    mockTx.priceListEntry.findMany.mockResolvedValue([
      { productId: "p-1" },
      { productId: "p-1" },
      { productId: "p-2" },
    ]);
    const result = await resolveSectionProductIds(mockTx as any, "org-1", ["sec-1"]);
    expect(mockTx.priceListEntry.findMany).toHaveBeenCalledWith({
      where: {
        section: {
          id: { in: ["sec-1"] },
          priceList: { organizationId: "org-1" },
        },
        productId: { not: null },
      },
      select: { productId: true },
    });
    expect(result).toEqual(["p-1", "p-2"]);
  });
});

describe("BULK_UPDATE_MAX module constant", () => {
  it("caps the affected set at 5000 products (exceeding → HTTP 400)", () => {
    expect(BULK_UPDATE_MAX).toBe(5000);
  });
});

describe("buildCategoryParentMap — parent lookup for inheritance walk", () => {
  it("maps each category to its parentId and roots to null", () => {
    const map = buildCategoryParentMap([
      { id: "a", parentId: null },
      { id: "b", parentId: "a" },
      { id: "c", parentId: "b" },
    ]);
    expect(map.get("a")).toBeNull();
    expect(map.get("b")).toBe("a");
    expect(map.get("c")).toBe("b");
  });
});

describe("resolveEffectivePercentage — product > nearest category ancestor > global", () => {
  // Tree: a → b → c (a parent of b, b parent of c)
  const parentById = new Map<string, string | null>([
    ["a", null],
    ["b", "a"],
    ["c", "b"],
  ]);

  const eff = (o: {
    productId?: string | null;
    categoryId?: string | null;
    categoryPercentages?: Array<[string, number]>;
    productPercentages?: Array<[string, number]>;
    globalPct?: number;
  }) =>
    resolveEffectivePercentage({
      productId: o.productId === undefined ? null : o.productId,
      categoryId: o.categoryId === undefined ? "c" : o.categoryId,
      parentById,
      categoryPercentages: new Map(o.categoryPercentages ?? []),
      productPercentages: new Map(o.productPercentages ?? []),
      globalPct: o.globalPct ?? 15,
    });

  it("uses the global percentage when no override exists on the ancestry (S5)", () => {
    expect(eff({ globalPct: 15 })).toBe(15);
  });

  it("product override wins over category and global (S4)", () => {
    expect(
      eff({
        productId: "p-x",
        productPercentages: [["p-x", 20]],
        categoryPercentages: [["c", 10]],
        globalPct: 0,
      }),
    ).toBe(20);
  });

  it("an exact-self category override applies (own category)", () => {
    expect(eff({ categoryPercentages: [["c", 10]] })).toBe(10);
  });

  it("a parent override inherits down to a descendant leaf (S2)", () => {
    expect(eff({ categoryPercentages: [["a", 10]] })).toBe(10);
  });

  it("a child override beats its ancestor override (S3)", () => {
    expect(
      eff({ categoryPercentages: [["a", 10], ["c", 5]] }),
    ).toBe(5);
  });

  it("returns 0% for an explicit 0% override (S6)", () => {
    expect(eff({ categoryPercentages: [["c", 0]], globalPct: 10 })).toBe(0);
  });

  it("falls to the product override when categoryId is null", () => {
    expect(
      eff({ categoryId: null, productId: "p-q", productPercentages: [["p-q", 25]] }),
    ).toBe(25);
  });

  it("falls to the global when categoryId is null and no product override", () => {
    expect(eff({ categoryId: null, globalPct: 12 })).toBe(12);
  });
});

describe("bulkPriceUpdate — preview (dryRun) and authoritative apply", () => {
  const mockedPrisma = prisma as unknown as {
    product: { findMany: jest.Mock };
    category: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };

  const mockTx = {
    category: { findMany: jest.fn() },
    product: { findMany: jest.fn(), updateMany: jest.fn() },
  };

  const makeProduct = (i: number) => ({
    id: `p-${i}`,
    name: `Producto ${i}`,
    price: 100,
    category: { name: "Perros" },
    variantAssignments: [
      { option: { value: "Acme", variant: { name: "Marca" } } },
    ],
  });

  const makeMany = (n: number) =>
    Array.from({ length: n }, (_, i) => makeProduct(i));

  const prodWithCat = (
    id: string,
    catId: string | null,
    catName: string,
    price = 100,
  ) => ({
    id,
    name: `Prod ${id}`,
    price,
    categoryId: catId,
    category: catId ? { name: catName } : null,
    variantAssignments: [
      { option: { value: "Acme", variant: { name: "Marca" } } },
    ],
  });

  const overrideDryRunReq = (overrides: {
    categoryPercentages?: Array<{ categoryId: string; percentage: number }>;
    productPercentages?: Array<{ productId: string; percentage: number }>;
    percentage?: number;
  }) =>
    ({
      body: {
        brandValues: ["Acme"],
        percentage: overrides.percentage ?? 10,
        categoryIds: [],
        excludeProductIds: [],
        categoryPercentages: overrides.categoryPercentages ?? [],
        productPercentages: overrides.productPercentages ?? [],
      },
      query: { dryRun: "true" },
    } as unknown as Request);

  const mockResponse = () => {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as unknown as Response & { status: jest.Mock; json: jest.Mock };
    return res;
  };

  const dryRunReq = (page?: number) =>
    ({
      body: {
        brandValues: ["Acme"],
        percentage: 10,
        categoryIds: ["a"],
        excludeProductIds: [],
      },
      query: { dryRun: "true", ...(page ? { page: String(page) } : {}) },
    } as unknown as Request);

  const applyReq = () =>
    ({
      body: {
        brandValues: ["Acme"],
        percentage: 10,
        categoryIds: ["a"],
        excludeProductIds: [],
      },
      query: {},
    } as unknown as Request);

  beforeEach(() => {
    jest.clearAllMocks();
    mockedPrisma.category.findMany.mockResolvedValue([
      { id: "a", parentId: null },
      { id: "b", parentId: "a" },
    ]);
  });

  describe("dryRun (preview)", () => {
    it("paginates at pageSize 50 and aggregates over the FULL set", async () => {
      mockedPrisma.product.findMany.mockResolvedValue(makeMany(60));
      const res = mockResponse();

      await productController.bulkPriceUpdate(dryRunReq(1), res);

      const json = res.json.mock.calls[0][0];
      expect(json.affected).toBe(60);
      expect(json.total).toBe(60);
      expect(json.page).toBe(1);
      expect(json.pageSize).toBe(50);
      expect(json.rows).toHaveLength(50);
      // Aggregates over the full set (60 × 100 = 6000 → +10% = 6600)
      expect(json.previousTotal).toBe(6000);
      expect(json.newTotal).toBe(6600);
    });

    it("returns the remaining rows on page 2", async () => {
      mockedPrisma.product.findMany.mockResolvedValue(makeMany(60));
      const res = mockResponse();

      await productController.bulkPriceUpdate(dryRunReq(2), res);

      const json = res.json.mock.calls[0][0];
      expect(json.page).toBe(2);
      expect(json.rows).toHaveLength(10);
      expect(json.affected).toBe(60);
    });

    it("rejects the request with 400 when the set exceeds BULK_UPDATE_MAX (no run)", async () => {
      mockedPrisma.product.findMany.mockResolvedValue(makeMany(BULK_UPDATE_MAX + 1));
      const res = mockResponse();

      await productController.bulkPriceUpdate(dryRunReq(1), res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("accepts a mid-size batch of 450 products (well below the 5000 cap)", async () => {
      mockedPrisma.product.findMany.mockResolvedValue(makeMany(450));
      const res = mockResponse();

      await productController.bulkPriceUpdate(dryRunReq(1), res);

      expect(res.status).toHaveBeenCalledWith(200);
      const json = res.json.mock.calls[0][0];
      expect(json.affected).toBe(450);
      expect(json.rows).toHaveLength(50);
    });

    it("exposes effectivePercentage on every preview row (global when no overrides)", async () => {
      mockedPrisma.product.findMany.mockResolvedValue(makeMany(2));
      const res = mockResponse();

      await productController.bulkPriceUpdate(dryRunReq(1), res);

      const rows = res.json.mock.calls[0][0].rows as Array<{
        effectivePercentage: number;
        newPrice: number;
      }>;
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row.effectivePercentage).toBe(10);
        expect(row.newPrice).toBe(110);
      }
    });

    it("applies a per-category override to that category's products and recomputes aggregates", async () => {
      mockedPrisma.product.findMany.mockResolvedValue([
        prodWithCat("p-a", "aaa", "Perros", 100),
        prodWithCat("p-b", "bbb", "Gatos", 120),
      ]);
      const res = mockResponse();

      await productController.bulkPriceUpdate(
        overrideDryRunReq({
          percentage: 10,
          categoryPercentages: [{ categoryId: "aaa", percentage: 20 }],
        }),
        res,
      );

      const json = res.json.mock.calls[0][0];
      const rows = json.rows as Array<{
        id: string;
        effectivePercentage: number;
        newPrice: number;
      }>;
      expect(rows.find((r) => r.id === "p-a")).toMatchObject({
        effectivePercentage: 20,
        newPrice: 120,
      });
      expect(rows.find((r) => r.id === "p-b")).toMatchObject({
        effectivePercentage: 10,
        newPrice: 132,
      });
      // previous 100+120=220; new 120+132=252
      expect(json.previousTotal).toBe(220);
      expect(json.newTotal).toBe(252);
    });

    it("inherits a parent category override to descendant products in preview (S2)", async () => {
      // categories a (root) → b (child of a); product in b inherits override on a
      mockedPrisma.category.findMany.mockResolvedValue([
        { id: "a", parentId: null },
        { id: "b", parentId: "a" },
      ]);
      mockedPrisma.product.findMany.mockResolvedValue([
        prodWithCat("p-l", "b", "B", 100),
      ]);
      const res = mockResponse();

      await productController.bulkPriceUpdate(
        overrideDryRunReq({
          percentage: 0,
          categoryPercentages: [{ categoryId: "a", percentage: 10 }],
        }),
        res,
      );

      const rows = res.json.mock.calls[0][0].rows as Array<{
        id: string;
        effectivePercentage: number;
        newPrice: number;
      }>;
      expect(rows[0]).toMatchObject({
        effectivePercentage: 10,
        newPrice: 110,
      });
      expect(res.json.mock.calls[0][0].affected).toBe(1);
    });

    it("keeps a 0%-override product included, unchanged and counted (S6)", async () => {
      mockedPrisma.product.findMany.mockResolvedValue([
        prodWithCat("p1", "aaa", "A", 100),
        prodWithCat("p2", "bbb", "B", 120),
      ]);
      const res = mockResponse();

      await productController.bulkPriceUpdate(
        overrideDryRunReq({
          percentage: 10,
          categoryPercentages: [{ categoryId: "aaa", percentage: 0 }],
        }),
        res,
      );

      const json = res.json.mock.calls[0][0];
      const rows = json.rows as Array<{
        id: string;
        effectivePercentage: number;
        newPrice: number;
      }>;
      expect(rows.find((r) => r.id === "p1")).toMatchObject({
        effectivePercentage: 0,
        newPrice: 100,
      });
      expect(json.affected).toBe(2);
      // previousTotal 220; new = 100 (p1) + 132 (p2) = 232
      expect(json.newTotal).toBe(232);
    });

    it("ignores an out-of-scope override id (S10)", async () => {
      mockedPrisma.product.findMany.mockResolvedValue(makeMany(1));
      const res = mockResponse();

      await productController.bulkPriceUpdate(
        overrideDryRunReq({
          percentage: 10,
          categoryPercentages: [{ categoryId: "zzz", percentage: 50 }],
        }),
        res,
      );

      const rows = res.json.mock.calls[0][0].rows as Array<{
        effectivePercentage: number;
        newPrice: number;
      }>;
      expect(rows[0]).toEqual(expect.objectContaining({
        effectivePercentage: 10,
        newPrice: 110,
      }));
    });

    it("runs with ONLY category overrides and no global percentage (global defaults to 0)", async () => {
      // p1 en categoría a (override 10% → 110); p2 en b → padre a (override
      // 10%) → 110 también. p3 sin categoría → sin override → global 0 → 100.
      mockedPrisma.product.findMany.mockResolvedValue([
        prodWithCat("p1", "a", "A", 100),
        prodWithCat("p2", "b", "B", 100),
        prodWithCat("p3", null, "SinC", 100),
      ]);
      const res = mockResponse();

      // percentage OMITIDO del body (como envía el front cuando no hay default).
      const req = {
        body: {
          brandValues: ["Acme"],
          categoryIds: ["a"],
          excludeProductIds: [],
          categoryPercentages: [{ categoryId: "a", percentage: 10 }],
          productPercentages: [],
        },
        query: { dryRun: "true" },
      } as unknown as Request;

      await productController.bulkPriceUpdate(req, res);

      const json = res.json.mock.calls[0][0];
      const rows = json.rows as Array<{
        id: string;
        effectivePercentage: number;
        newPrice: number;
      }>;
      expect(json.affected).toBe(3);
      expect(rows.find((r) => r.id === "p1")).toMatchObject({
        effectivePercentage: 10,
        newPrice: 110,
      });
      // p3 sin categoría ni override → el default global es 0, no cambia.
      expect(rows.find((r) => r.id === "p3")).toMatchObject({
        effectivePercentage: 0,
        newPrice: 100,
      });
    });
  });

  describe("apply (authoritative $transaction)", () => {
    beforeEach(() => {
      mockedPrisma.$transaction.mockImplementation(
        async (cb: (tx: any) => unknown) => cb(mockTx),
      );
      mockTx.category.findMany.mockResolvedValue([
        { id: "a", parentId: null },
      ]);
    });

    it("re-resolves the affected set inside the transaction and updates each product", async () => {
      mockTx.product.findMany.mockResolvedValue([
        { id: "p-1", price: 100 },
        { id: "p-2", price: 200 },
      ]);
      const res = mockResponse();

      await productController.bulkPriceUpdate(applyReq(), res);

      // Interactive transaction callback was used
      expect(mockedPrisma.$transaction).toHaveBeenCalledWith(expect.any(Function));
      // Re-resolve happened on the tx: categories fetched + products queried with the expanded where
      expect(mockTx.category.findMany).toHaveBeenCalled();
      expect(mockTx.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ categoryId: { in: ["a"] } }),
        }),
      );
      // updateMany loop per product with computed new prices
      expect(mockTx.product.updateMany).toHaveBeenCalledTimes(2);
      expect(mockTx.product.updateMany).toHaveBeenCalledWith({
        where: { id: "p-1" },
        data: { price: 110 },
      });
      expect(mockTx.product.updateMany).toHaveBeenCalledWith({
        where: { id: "p-2" },
        data: { price: 220 },
      });
      // Authoritative totals
      expect(res.status).toHaveBeenCalledWith(200);
      const json = res.json.mock.calls[0][0];
      expect(json).toEqual({
        affected: 2,
        previousTotal: 300,
        newTotal: 330,
      });
    });

    it("returns 400 when every product was excluded (affected === 0, no write)", async () => {
      mockTx.product.findMany.mockResolvedValue([]);
      const res = mockResponse();

      await productController.bulkPriceUpdate(applyReq(), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockTx.product.updateMany).not.toHaveBeenCalled();
    });

    it("returns 400 when the set exceeds BULK_UPDATE_MAX WITHOUT writing", async () => {
      mockTx.product.findMany.mockResolvedValue(
        Array.from({ length: BULK_UPDATE_MAX + 1 }, (_, i) => ({
          id: `p-${i}`,
          price: 100,
        })),
      );
      const res = mockResponse();

      await productController.bulkPriceUpdate(applyReq(), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockTx.product.updateMany).not.toHaveBeenCalled();
    });

    it("applies a mid-size batch of 450 products (below the 5000 cap)", async () => {
      mockTx.product.findMany.mockResolvedValue(
        Array.from({ length: 450 }, (_, i) => ({ id: `p-${i}`, price: 100 })),
      );
      const res = mockResponse();

      await productController.bulkPriceUpdate(applyReq(), res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockTx.product.updateMany).toHaveBeenCalledTimes(450);
    });

    it("re-applies exclusion ids on the re-resolved where inside the transaction", async () => {
      mockTx.product.findMany.mockResolvedValue([{ id: "p-1", price: 100 }]);
      const res = mockResponse();

      await productController.bulkPriceUpdate(
        {
          body: {
            brandValues: ["Acme"],
            percentage: -20,
            categoryIds: ["a"],
            excludeProductIds: ["p-9"],
          },
          query: {},
        } as unknown as Request,
        res,
      );

      expect(mockTx.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { notIn: ["p-9"] } }),
        }),
      );
      expect(mockTx.product.updateMany).toHaveBeenCalledWith({
        where: { id: "p-1" },
        data: { price: 80 },
      });
    });

    it("applies a per-category override inside the transaction (S2/S4 apply-side)", async () => {
      mockTx.product.findMany.mockResolvedValue([
        { id: "p-1", price: 100, categoryId: "a" },
        { id: "p-2", price: 200, categoryId: "b" },
      ]);
      const res = mockResponse();

      await productController.bulkPriceUpdate(
        {
          body: {
            brandValues: ["Acme"],
            percentage: 10,
            categoryIds: ["a"],
            excludeProductIds: [],
            categoryPercentages: [{ categoryId: "a", percentage: 20 }],
            productPercentages: [],
          },
          query: {},
        } as unknown as Request,
        res,
      );

      // In-tx findMany must select categoryId so effective % can be resolved
      expect(mockTx.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({ categoryId: true }),
        }),
      );
      // p-1 (category a) uses the 20% override → 120; p-2 (category b, child of a)
      // inherits from ancestor a → 20% → 240
      expect(mockTx.product.updateMany).toHaveBeenCalledWith({
        where: { id: "p-1" },
        data: { price: 120 },
      });
      expect(mockTx.product.updateMany).toHaveBeenCalledWith({
        where: { id: "p-2" },
        data: { price: 240 },
      });
      const json = res.json.mock.calls[0][0];
      expect(json.newTotal).toBe(360);
    });

    it("applies a per-product override beating category and global (S4 apply-side)", async () => {
      mockTx.product.findMany.mockResolvedValue([
        { id: "p-1", price: 100, categoryId: "a" },
      ]);
      const res = mockResponse();

      await productController.bulkPriceUpdate(
        {
          body: {
            brandValues: ["Acme"],
            percentage: 10,
            categoryIds: ["a"],
            excludeProductIds: [],
            categoryPercentages: [{ categoryId: "a", percentage: 20 }],
            productPercentages: [{ productId: "p-1", percentage: 30 }],
          },
          query: {},
        } as unknown as Request,
        res,
      );

      expect(mockTx.product.updateMany).toHaveBeenCalledWith({
        where: { id: "p-1" },
        data: { price: 130 },
      });
      const json = res.json.mock.calls[0][0];
      expect(json.newTotal).toBe(130);
    });

    it("keeps a 0%-override product included, unchanged and counted at apply (S6 apply-side)", async () => {
      mockTx.product.findMany.mockResolvedValue([
        { id: "p-1", price: 100, categoryId: "a" },
      ]);
      const res = mockResponse();

      await productController.bulkPriceUpdate(
        {
          body: {
            brandValues: ["Acme"],
            percentage: 10,
            categoryIds: ["a"],
            excludeProductIds: [],
            categoryPercentages: [],
            productPercentages: [{ productId: "p-1", percentage: 0 }],
          },
          query: {},
        } as unknown as Request,
        res,
      );

      expect(mockTx.product.updateMany).toHaveBeenCalledWith({
        where: { id: "p-1" },
        data: { price: 100 },
      });
      const json = res.json.mock.calls[0][0];
      expect(json.affected).toBe(1);
      expect(json.newTotal).toBe(100);
    });
  });
});

import { Request, Response } from "express";
import productController, {
  computeNewPrice,
  resolveCategoryScope,
  buildBulkPriceWhere,
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
    $transaction: jest.fn(),
  },
  basePrisma: {},
}));

jest.mock("../../src/config/tenantContext", () => ({
  requireOrganizationId: jest.fn().mockReturnValue("org-1"),
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

describe("BULK_UPDATE_MAX module constant", () => {
  it("caps the affected set at 5000 products (exceeding → HTTP 400)", () => {
    expect(BULK_UPDATE_MAX).toBe(5000);
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
  });
});

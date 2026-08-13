import { Request, Response } from "express";
import { bulkKgPriceUpdate, matchNameSynonyms } from "../../src/controllers/productController";
import { prisma } from "../../src/config/db";

// Same module-graph mocks as productController.bulkPrice.test.ts: the controller
// imports prisma/config/services at load time.
jest.mock("../../src/config/db", () => ({
  prisma: {
    product: { findMany: jest.fn() },
    priceKgType: { findFirst: jest.fn() },
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

describe("matchNameSynonyms — case-insensitive substring match", () => {
  it("matches when the name contains any synonym (case-insensitive)", () => {
    expect(
      matchNameSynonyms("CAT CHOW ADULTOS CARNE X 15 KG", ["ADULTO", "ADULTOS", "ADULT"]),
    ).toBe(true);
  });

  it("matches a synonym as a substring of a word (ADULTO inside ADULTOS)", () => {
    expect(matchNameSynonyms("SIEGER ADULTOS", ["ADULTO"])).toBe(true);
  });

  it("is case-insensitive both ways", () => {
    expect(matchNameSynonyms("puppy cachorro", ["CACHORRO"])).toBe(true);
    expect(matchNameSynonyms("PUPPY CACHORRO", ["cachorro"])).toBe(true);
  });

  it("returns false when no synonym matches", () => {
    expect(matchNameSynonyms("SIEGER KITTEN", ["ADULTO", "SENIOR"])).toBe(false);
  });

  it("returns false for an empty synonyms array", () => {
    expect(matchNameSynonyms("ADULTO", [])).toBe(false);
  });

  it("ignores empty/whitespace synonyms without breaking", () => {
    expect(matchNameSynonyms("ADULTO", ["", "  ", "ADULTO"])).toBe(true);
    expect(matchNameSynonyms("SENIOR", ["", "  "])).toBe(false);
  });

  it("returns false for an empty name", () => {
    expect(matchNameSynonyms("", ["ADULTO"])).toBe(false);
  });
});

describe("bulkKgPriceUpdate — preview (dryRun) and authoritative apply", () => {
  const mockedPrisma = prisma as unknown as {
    product: { findMany: jest.Mock };
    priceKgType: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };

  const mockTx = {
    priceKgType: { findFirst: jest.fn() },
    product: { findMany: jest.fn(), updateMany: jest.fn() },
  };

  const mockResponse = () => {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as unknown as Response & { status: jest.Mock; json: jest.Mock };
    return res;
  };

  const type = { id: "type-adulto", name: "Adulto", synonyms: ["ADULTO", "ADULTOS"] };

  const makeProduct = (i: number, name = `ALIMENTO ADULTO ${i}`) => ({
    id: `p-${i}`,
    name,
    priceKgSuelto: 5000,
  });

  const previewReq = (body: any = {}) =>
    ({
      body: { brandValues: ["Acme"], typeId: "type-adulto", priceKg: 5500, ...body },
      query: { dryRun: "true" },
    } as unknown as Request);

  const applyReq = (body: any = {}) =>
    ({
      body: { brandValues: ["Acme"], typeId: "type-adulto", priceKg: 5500, ...body },
      query: {},
    } as unknown as Request);

  beforeEach(() => {
    jest.clearAllMocks();
    mockedPrisma.priceKgType.findFirst.mockResolvedValue(type);
    mockedPrisma.$transaction.mockImplementation(
      async (cb: (tx: any) => unknown) => cb(mockTx),
    );
  });

  describe("preview (dryRun)", () => {
    it("returns matched rows with current/new price per kg", async () => {
      mockedPrisma.product.findMany.mockResolvedValue([
        makeProduct(1),
        makeProduct(2, "SIEGER KITTEN"),
        makeProduct(3),
      ]);
      const res = mockResponse();

      await bulkKgPriceUpdate(previewReq(), res);

      expect(res.status).toHaveBeenCalledWith(200);
      const json = res.json.mock.calls[0][0];
      expect(json.affected).toBe(2);
      expect(json.rows).toHaveLength(2);
      expect(json.rows[0]).toEqual({
        id: "p-1",
        name: "ALIMENTO ADULTO 1",
        currentPriceKg: 5000,
        newPriceKg: 5500,
      });
      expect(json.rows.find((r: any) => r.id === "p-2")).toBeUndefined();
    });

    it("rounds newPriceKg to 2 decimals", async () => {
      mockedPrisma.product.findMany.mockResolvedValue([makeProduct(1)]);
      const res = mockResponse();

      await bulkKgPriceUpdate(
        previewReq({ priceKg: 5500.567 }),
        res,
      );

      const json = res.json.mock.calls[0][0];
      expect(json.rows[0].newPriceKg).toBe(5500.57);
    });

    it("falls back to type.name when synonyms is empty", async () => {
      mockedPrisma.priceKgType.findFirst.mockResolvedValue({
        id: "t-senior",
        name: "Senior",
        synonyms: [],
      });
      mockedPrisma.product.findMany.mockResolvedValue([
        makeProduct(1, "ALIMENTO SENIOR 15KG"),
        makeProduct(2, "ALIMENTO ADULTO"),
      ]);
      const res = mockResponse();

      await bulkKgPriceUpdate(
        previewReq({ typeId: "t-senior" }),
        res,
      );

      const json = res.json.mock.calls[0][0];
      expect(json.affected).toBe(1);
      expect(json.rows[0].id).toBe("p-1");
    });

    it("returns 404 when the type does not exist", async () => {
      mockedPrisma.priceKgType.findFirst.mockResolvedValue(null);
      const res = mockResponse();

      await bulkKgPriceUpdate(previewReq(), res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("returns 400 when no product matches the brand + type", async () => {
      mockedPrisma.product.findMany.mockResolvedValue([
        makeProduct(1, "SIEGER KITTEN"),
      ]);
      const res = mockResponse();

      await bulkKgPriceUpdate(previewReq(), res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("returns 400 when the matched set exceeds BULK_UPDATE_MAX (5000)", async () => {
      mockedPrisma.product.findMany.mockResolvedValue(
        Array.from({ length: 5001 }, (_, i) => makeProduct(i)),
      );
      const res = mockResponse();

      await bulkKgPriceUpdate(previewReq(), res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe("apply (authoritative $transaction)", () => {
    beforeEach(() => {
      mockTx.priceKgType.findFirst.mockResolvedValue(type);
    });

    it("re-resolves the set in-tx and updates priceKgSuelto + manual flag", async () => {
      mockedPrisma.product.findMany.mockResolvedValue([makeProduct(1), makeProduct(2)]);
      mockTx.product.findMany.mockResolvedValue([
        { id: "p-1", name: "ALIMENTO ADULTO 1" },
        { id: "p-2", name: "ALIMENTO ADULTO 2" },
      ]);
      mockTx.product.updateMany.mockResolvedValue({ count: 2 });
      const res = mockResponse();

      await bulkKgPriceUpdate(applyReq(), res);

      expect(mockedPrisma.$transaction).toHaveBeenCalledWith(expect.any(Function));
      expect(mockTx.priceKgType.findFirst).toHaveBeenCalledWith({
        where: { id: "type-adulto", organizationId: "org-1" },
        select: { id: true, name: true, synonyms: true },
      });
      expect(mockTx.product.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["p-1", "p-2"] }, organizationId: "org-1" },
        data: { priceKgSuelto: 5500, priceKgSueltoManual: true },
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json.mock.calls[0][0]).toEqual({ affected: 2 });
    });

    it("returns 400 when the in-tx set has 0 matches (no write)", async () => {
      mockedPrisma.product.findMany.mockResolvedValue([makeProduct(1, "KITTEN")]);
      mockTx.product.findMany.mockResolvedValue([]);
      const res = mockResponse();

      await bulkKgPriceUpdate(applyReq(), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockTx.product.updateMany).not.toHaveBeenCalled();
    });

    it("returns 400 when the in-tx set exceeds BULK_UPDATE_MAX (no write)", async () => {
      mockedPrisma.product.findMany.mockResolvedValue([
        makeProduct(1),
      ]);
      mockTx.product.findMany.mockResolvedValue(
        Array.from({ length: 5001 }, (_, i) => ({ id: `p-${i}`, name: "ADULTO" })),
      );
      const res = mockResponse();

      await bulkKgPriceUpdate(applyReq(), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockTx.product.updateMany).not.toHaveBeenCalled();
    });

    it("returns 404 when the type is gone at apply time", async () => {
      mockedPrisma.product.findMany.mockResolvedValue([makeProduct(1)]);
      mockTx.priceKgType.findFirst.mockResolvedValue(null);
      const res = mockResponse();

      await bulkKgPriceUpdate(applyReq(), res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(mockTx.product.updateMany).not.toHaveBeenCalled();
    });
  });
});

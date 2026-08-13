import { Request, Response } from "express";
import {
  bulkKgPriceUpdate,
  matchNameSynonyms,
  matchBrandKeywords,
} from "../../src/controllers/productController";
import { prisma } from "../../src/config/db";

// Same module-graph mocks as productController.bulkPrice.test.ts: the controller
// imports prisma/config/services at load time.
jest.mock("../../src/config/db", () => ({
  prisma: {
    product: { findMany: jest.fn() },
    priceKgType: { findMany: jest.fn() },
    priceKgBrand: { findFirst: jest.fn() },
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

describe("matchBrandKeywords — AND case-insensitive substring match", () => {
  it("matches when the name contains ALL keywords", () => {
    expect(
      matchBrandKeywords("MAXXIUM CORDERO ADULTO X 15 KG", ["MAXXIUM", "CORDERO"]),
    ).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(matchBrandKeywords("maxxium cordero adulto", ["MAXXIUM", "cordero"])).toBe(true);
  });

  it("returns false when ANY keyword is missing (AND semantics)", () => {
    expect(
      matchBrandKeywords("MAXXIUM ADULTO X 15 KG", ["MAXXIUM", "CORDERO"]),
    ).toBe(false);
  });

  it("returns false for empty/whitespace-only keywords", () => {
    expect(matchBrandKeywords("MAXXIUM", [])).toBe(false);
    expect(matchBrandKeywords("MAXXIUM", ["", "  "])).toBe(false);
  });

  it("ignores empty keywords but requires the rest (AND)", () => {
    expect(matchBrandKeywords("MAXXIUM CORDERO", ["", "MAXXIUM"])).toBe(true);
  });

  it("returns false for an empty name", () => {
    expect(matchBrandKeywords("", ["MAXXIUM"])).toBe(false);
  });
});

describe("bulkKgPriceUpdate — preview (dryRun) and authoritative apply", () => {
  const mockedPrisma = prisma as unknown as {
    product: { findMany: jest.Mock };
    priceKgType: { findMany: jest.Mock };
    priceKgBrand: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };

  const mockTx = {
    priceKgType: { findMany: jest.fn() },
    priceKgBrand: { findFirst: jest.fn() },
    product: { findMany: jest.fn(), updateMany: jest.fn() },
  };

  const mockResponse = () => {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as unknown as Response & { status: jest.Mock; json: jest.Mock };
    return res;
  };

  const typeAdulto = { id: "type-adulto", name: "Adulto", synonyms: ["ADULTO", "ADULTOS"] };
  const typeKitten = { id: "type-kitten", name: "Kitten", synonyms: ["KITTEN"] };

  // Brand keywords match the "ACME " prefix present in every product name.
  const brand = { id: "brand-1", name: "Acme", keywords: ["ACME"] };

  const makeProduct = (i: number, name = `ACME ALIMENTO ADULTO ${i}`) => ({
    id: `p-${i}`,
    name,
    priceKgSuelto: 5000,
  });

  const previewReq = (body: any = {}) =>
    ({
      body: {
        brandId: "brand-1",
        entries: [{ typeId: "type-adulto", priceKg: 5500 }],
        ...body,
      },
      query: { dryRun: "true" },
    } as unknown as Request);

  const applyReq = (body: any = {}) =>
    ({
      body: {
        brandId: "brand-1",
        entries: [{ typeId: "type-adulto", priceKg: 5500 }],
        ...body,
      },
      query: {},
    } as unknown as Request);

  beforeEach(() => {
    jest.clearAllMocks();
    mockedPrisma.priceKgType.findMany.mockResolvedValue([typeAdulto]);
    mockedPrisma.priceKgBrand.findFirst.mockResolvedValue(brand);
    mockedPrisma.$transaction.mockImplementation(
      async (cb: (tx: any) => unknown) => cb(mockTx),
    );
  });

  describe("preview (dryRun)", () => {
    it("returns matched rows with typeId/typeName/current/new price per kg", async () => {
      mockedPrisma.product.findMany.mockResolvedValue([
        makeProduct(1),
        makeProduct(2, "ACME SIEGER KITTEN"),
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
        name: "ACME ALIMENTO ADULTO 1",
        typeId: "type-adulto",
        typeName: "Adulto",
        currentPriceKg: 5000,
        newPriceKg: 5500,
      });
      expect(json.rows.find((r: any) => r.id === "p-2")).toBeUndefined();
    });

    it("groups two entries by type and resolves the type per row", async () => {
      mockedPrisma.priceKgType.findMany.mockResolvedValue([typeAdulto, typeKitten]);
      mockedPrisma.product.findMany.mockResolvedValue([
        makeProduct(1, "ACME ALIMENTO ADULTO 1"),
        makeProduct(2, "ACME SIEGER KITTEN"),
      ]);
      const res = mockResponse();

      await bulkKgPriceUpdate(
        previewReq({
          entries: [
            { typeId: "type-adulto", priceKg: 5500 },
            { typeId: "type-kitten", priceKg: 3000 },
          ],
        }),
        res,
      );

      const json = res.json.mock.calls[0][0];
      expect(json.affected).toBe(2);
      const adulto = json.rows.find((r: any) => r.id === "p-1");
      const kitten = json.rows.find((r: any) => r.id === "p-2");
      expect(adulto).toMatchObject({ typeId: "type-adulto", typeName: "Adulto", newPriceKg: 5500 });
      expect(kitten).toMatchObject({ typeId: "type-kitten", typeName: "Kitten", newPriceKg: 3000 });
    });

    it("first entry wins when a product matches two overlapping types", async () => {
      mockedPrisma.priceKgType.findMany.mockResolvedValue([
        { id: "type-adulto", name: "Adulto", synonyms: ["ADULTO"] },
        { id: "type-adultos", name: "Adultos", synonyms: ["ADULTOS"] },
      ]);
      // "ACME ALIMENTO ADULTOS 1" contains both ADULTO (substring of ADULTOS)
      // and ADULTOS: the FIRST entry (type-adulto) must claim it.
      mockedPrisma.product.findMany.mockResolvedValue([makeProduct(1, "ACME ALIMENTO ADULTOS 1")]);
      const res = mockResponse();

      await bulkKgPriceUpdate(
        previewReq({
          entries: [
            { typeId: "type-adulto", priceKg: 1000 },
            { typeId: "type-adultos", priceKg: 2000 },
          ],
        }),
        res,
      );

      const json = res.json.mock.calls[0][0];
      expect(json.affected).toBe(1);
      expect(json.rows[0]).toMatchObject({ id: "p-1", typeId: "type-adulto", newPriceKg: 1000 });
    });

    it("rounds newPriceKg to 2 decimals per entry", async () => {
      mockedPrisma.product.findMany.mockResolvedValue([makeProduct(1)]);
      const res = mockResponse();

      await bulkKgPriceUpdate(
        previewReq({ entries: [{ typeId: "type-adulto", priceKg: 5500.567 }] }),
        res,
      );

      const json = res.json.mock.calls[0][0];
      expect(json.rows[0].newPriceKg).toBe(5500.57);
    });

    it("falls back to type.name when synonyms is empty", async () => {
      mockedPrisma.priceKgType.findMany.mockResolvedValue([
        { id: "t-senior", name: "Senior", synonyms: [] },
      ]);
      mockedPrisma.product.findMany.mockResolvedValue([
        makeProduct(1, "ACME ALIMENTO SENIOR 15KG"),
        makeProduct(2, "ACME ALIMENTO ADULTO"),
      ]);
      const res = mockResponse();

      await bulkKgPriceUpdate(
        previewReq({ entries: [{ typeId: "t-senior", priceKg: 5500 }] }),
        res,
      );

      const json = res.json.mock.calls[0][0];
      expect(json.affected).toBe(1);
      expect(json.rows[0]).toMatchObject({ id: "p-1", typeName: "Senior" });
    });

    it("falls back to brand.name when keywords is empty", async () => {
      mockedPrisma.priceKgBrand.findFirst.mockResolvedValue({
        id: "brand-1",
        name: "ACME",
        keywords: [],
      });
      mockedPrisma.product.findMany.mockResolvedValue([
        makeProduct(1, "ACME ALIMENTO ADULTO 1"),
        makeProduct(2, "SIEGER ADULTO"),
      ]);
      const res = mockResponse();

      await bulkKgPriceUpdate(previewReq(), res);

      const json = res.json.mock.calls[0][0];
      expect(json.affected).toBe(1);
      expect(json.rows[0]).toMatchObject({ id: "p-1" });
    });

    it("matches the brand by AND keywords on the product name", async () => {
      // Brand keywords AND: only products containing BOTH "ACME" and "CORDERO".
      mockedPrisma.priceKgBrand.findFirst.mockResolvedValue({
        id: "brand-1",
        name: "Acme Cordero",
        keywords: ["ACME", "CORDERO"],
      });
      mockedPrisma.product.findMany.mockResolvedValue([
        makeProduct(1, "ACME CORDERO ADULTO 1"),
        makeProduct(2, "ACME POLLO ADULTO 2"),
      ]);
      const res = mockResponse();

      await bulkKgPriceUpdate(previewReq(), res);

      const json = res.json.mock.calls[0][0];
      expect(json.affected).toBe(1);
      expect(json.rows[0]).toMatchObject({ id: "p-1" });
    });

    it("returns 404 when the brand does not exist", async () => {
      mockedPrisma.priceKgBrand.findFirst.mockResolvedValue(null);
      const res = mockResponse();

      await bulkKgPriceUpdate(previewReq(), res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json.mock.calls[0][0]).toEqual({ message: "Marca no encontrada" });
    });

    it("returns 404 when any type does not exist", async () => {
      mockedPrisma.priceKgType.findMany.mockResolvedValue([typeAdulto]);
      const res = mockResponse();

      await bulkKgPriceUpdate(
        previewReq({
          entries: [
            { typeId: "type-adulto", priceKg: 5500 },
            { typeId: "type-missing", priceKg: 3000 },
          ],
        }),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("returns 400 when no product matches the brand + types", async () => {
      mockedPrisma.product.findMany.mockResolvedValue([
        makeProduct(1, "ACME SIEGER SENIOR"),
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
      mockTx.priceKgType.findMany.mockResolvedValue([typeAdulto]);
      mockTx.priceKgBrand.findFirst.mockResolvedValue(brand);
    });

    it("re-resolves the set in-tx and updates priceKgSuelto + manual flag", async () => {
      mockedPrisma.product.findMany.mockResolvedValue([makeProduct(1), makeProduct(2)]);
      mockTx.product.findMany.mockResolvedValue([
        { id: "p-1", name: "ACME ALIMENTO ADULTO 1" },
        { id: "p-2", name: "ACME ALIMENTO ADULTO 2" },
      ]);
      mockTx.product.updateMany.mockResolvedValue({ count: 2 });
      const res = mockResponse();

      await bulkKgPriceUpdate(applyReq(), res);

      expect(mockedPrisma.$transaction).toHaveBeenCalledWith(expect.any(Function));
      expect(mockTx.priceKgBrand.findFirst).toHaveBeenCalledWith({
        where: { id: "brand-1", organizationId: "org-1" },
        select: { id: true, name: true, keywords: true },
      });
      expect(mockTx.priceKgType.findMany).toHaveBeenCalledWith({
        where: { id: { in: ["type-adulto"] }, organizationId: "org-1" },
        select: { id: true, name: true, synonyms: true },
      });
      expect(mockTx.product.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["p-1", "p-2"] }, organizationId: "org-1" },
        data: { priceKgSuelto: 5500, priceKgSueltoManual: true },
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json.mock.calls[0][0]).toEqual({ affected: 2 });
    });

    it("updates each entry with its own price (updateMany per entry)", async () => {
      mockedPrisma.priceKgType.findMany.mockResolvedValue([typeAdulto, typeKitten]);
      mockTx.priceKgType.findMany.mockResolvedValue([typeAdulto, typeKitten]);
      mockedPrisma.product.findMany.mockResolvedValue([]);
      mockTx.product.findMany.mockResolvedValue([
        { id: "p-1", name: "ACME ALIMENTO ADULTO 1" },
        { id: "p-2", name: "ACME SIEGER KITTEN" },
      ]);
      mockTx.product.updateMany.mockResolvedValue({ count: 1 });
      const res = mockResponse();

      await bulkKgPriceUpdate(
        applyReq({
          entries: [
            { typeId: "type-adulto", priceKg: 5500 },
            { typeId: "type-kitten", priceKg: 3000 },
          ],
        }),
        res,
      );

      expect(mockTx.product.updateMany).toHaveBeenCalledTimes(2);
      expect(mockTx.product.updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: { in: ["p-1"] }, organizationId: "org-1" },
        data: { priceKgSuelto: 5500, priceKgSueltoManual: true },
      });
      expect(mockTx.product.updateMany).toHaveBeenNthCalledWith(2, {
        where: { id: { in: ["p-2"] }, organizationId: "org-1" },
        data: { priceKgSuelto: 3000, priceKgSueltoManual: true },
      });
      expect(res.json.mock.calls[0][0]).toEqual({ affected: 2 });
    });

    it("returns 400 when the in-tx set has 0 matches (no write)", async () => {
      mockedPrisma.product.findMany.mockResolvedValue([makeProduct(1, "ACME KITTEN")]);
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
        Array.from({ length: 5001 }, (_, i) => ({ id: `p-${i}`, name: "ACME ADULTO" })),
      );
      const res = mockResponse();

      await bulkKgPriceUpdate(applyReq(), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockTx.product.updateMany).not.toHaveBeenCalled();
    });

    it("returns 404 when a type is gone at apply time", async () => {
      mockedPrisma.product.findMany.mockResolvedValue([makeProduct(1)]);
      mockTx.priceKgType.findMany.mockResolvedValue([]);
      const res = mockResponse();

      await bulkKgPriceUpdate(applyReq(), res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(mockTx.product.updateMany).not.toHaveBeenCalled();
    });

    it("returns 404 when the brand is gone at apply time", async () => {
      mockedPrisma.product.findMany.mockResolvedValue([makeProduct(1)]);
      mockTx.priceKgBrand.findFirst.mockResolvedValue(null);
      const res = mockResponse();

      await bulkKgPriceUpdate(applyReq(), res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(mockTx.product.updateMany).not.toHaveBeenCalled();
    });
  });
});

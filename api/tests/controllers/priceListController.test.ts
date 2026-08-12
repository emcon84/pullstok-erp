import { Request, Response } from "express";
import {
  listPriceLists,
  getPriceList,
  adjustPriceList,
} from "../../src/controllers/providerPriceListController";
import { prisma } from "../../src/config/db";

jest.mock("../../src/config/db", () => ({
  prisma: {
    priceList: { findMany: jest.fn(), findFirst: jest.fn() },
    priceListEntry: { findMany: jest.fn() },
    $transaction: jest.fn(),
  },
  basePrisma: {},
}));

jest.mock("../../src/config/tenantContext", () => ({
  requireOrganizationId: jest.fn().mockReturnValue("org-1"),
}));

const mockedPrisma = prisma as unknown as {
  priceList: { findMany: jest.Mock; findFirst: jest.Mock };
  priceListEntry: { findMany: jest.Mock };
  $transaction: jest.Mock;
};

const fakeRes = () => {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
  return res;
};

const fakeReq = (overrides: Record<string, unknown> = {}) =>
  ({ params: {}, query: {}, body: {}, ...overrides }) as unknown as Request;

describe("listPriceLists — planillas de la org por importedAt desc", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns items ordered by importedAt desc with sectionsCount/entriesCount", async () => {
    mockedPrisma.priceList.findMany.mockResolvedValue([
      {
        id: "pl-1",
        provider: "ALICAN",
        type: "SECO",
        period: "2026-08-10",
        sourceFilename: "a.pdf",
        importedAt: new Date("2026-08-10T10:00:00Z"),
        _count: { sections: 12 },
        sections: [
          { _count: { entries: 100 } },
          { _count: { entries: 20 } },
        ],
      },
    ]);
    const res = fakeRes();
    await listPriceLists(fakeReq(), res);

    expect(mockedPrisma.priceList.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "org-1" },
        orderBy: { importedAt: "desc" },
      }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      items: [
        {
          id: "pl-1",
          provider: "ALICAN",
          type: "SECO",
          period: "2026-08-10",
          sourceFilename: "a.pdf",
          importedAt: new Date("2026-08-10T10:00:00Z"),
          sectionsCount: 12,
          entriesCount: 120,
        },
      ],
    });
  });
});

describe("getPriceList — jerarquía ordenada con 404 cross-org", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns the plan with sections and entries ordered by position", async () => {
    mockedPrisma.priceList.findFirst.mockResolvedValue({
      id: "pl-1",
      provider: "ALICAN",
      type: "SECO",
      period: "2026-08-10",
      sourceFilename: "a.pdf",
      importedAt: new Date("2026-08-10T10:00:00Z"),
      sections: [
        {
          id: "sec-1",
          brand: "SIEGER",
          line: "SUPER PREMIUM PARA PERROS",
          subline: "SIEGER PUPPY",
          position: 0,
          entries: [
            {
              id: "ent-1",
              productId: "p1",
              name: "SIEGER Puppy Mini x 1 Kg.",
              unit: "1 Kg.",
              priceSinIva: 8795,
              priceConIva: 10642,
              suggestedPrice: 14190.04,
              matched: true,
              position: 0,
            },
          ],
        },
      ],
    });
    const res = fakeRes();
    await getPriceList(fakeReq({ params: { id: "pl-1" } }), res);

    expect(mockedPrisma.priceList.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "pl-1", organizationId: "org-1" },
      }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.sections[0].entries[0].name).toBe("SIEGER Puppy Mini x 1 Kg.");
    expect(body.sections[0].entries[0].suggestedPrice).toBe(14190.04);
  });

  it("returns 404 for a plan of another org or inexistent (findFirst with orgId)", async () => {
    mockedPrisma.priceList.findFirst.mockResolvedValue(null);
    const res = fakeRes();
    await getPriceList(fakeReq({ params: { id: "pl-ajena" } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("adjustPriceList — % server-side sobre el suggestedPrice ACTUAL (D7)", () => {
  const entry = (id: string, name: string, suggestedPrice: number | null, productId = "p1") => ({
    id,
    productId,
    name,
    suggestedPrice,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockedPrisma.priceList.findFirst.mockResolvedValue({ id: "pl-1" });
    mockedPrisma.priceListEntry.findMany.mockResolvedValue([
      entry("e1", "A x 1 Kg.", 100),
      entry("e2", "B x 3 Kg.", 200),
      entry("e3", "C x 15 Kg.", null),
    ]);
  });

  it("applies the percentage over the current suggestedPrice and returns the dryRun rows", async () => {
    const res = fakeRes();
    await adjustPriceList(
      fakeReq({ params: { id: "pl-1" }, query: { dryRun: "true" }, body: { percentage: 10 } }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(200);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.affected).toBe(3);
    expect(body.rows).toHaveLength(3);
    expect(body.rows[0]).toEqual({
      entryId: "e1",
      name: "A x 1 Kg.",
      productId: "p1",
      suggestedPrice: 100,
      newSuggestedPrice: 110,
      delta: 10,
    });
    expect(body.previousTotal).toBe(300);
    expect(body.newTotal).toBe(330);
  });

  it("excludes entries listed in excludeEntryIds", async () => {
    const res = fakeRes();
    await adjustPriceList(
      fakeReq({
        params: { id: "pl-1" },
        query: { dryRun: "true" },
        body: { percentage: 10, excludeEntryIds: ["e2"] },
      }),
      res,
    );
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.affected).toBe(2);
    expect(body.rows.map((r: any) => r.entryId)).toEqual(["e1", "e3"]);
  });

  it("applies entry overrides by entryId instead of the percentage", async () => {
    const res = fakeRes();
    await adjustPriceList(
      fakeReq({
        params: { id: "pl-1" },
        query: { dryRun: "true" },
        body: { percentage: 10, entryOverrides: [{ entryId: "e2", suggestedPrice: 999 }] },
      }),
      res,
    );
    const body = (res.json as jest.Mock).mock.calls[0][0];
    const e2 = body.rows.find((r: any) => r.entryId === "e2");
    expect(e2.newSuggestedPrice).toBe(999);
  });

  it("is compound on re-runs: a second run reads the UPDATED suggestedPrice", async () => {
    // Primer run: 10% sobre 100 → 110.
    const first = fakeRes();
    await adjustPriceList(
      fakeReq({ params: { id: "pl-1" }, query: { dryRun: "true" }, body: { percentage: 10 } }),
      first,
    );
    expect((first.json as jest.Mock).mock.calls[0][0].rows[0].newSuggestedPrice).toBe(110);

    // Segundo run: la planilla YA tiene 110 → 10% más = 121 (compuesto).
    mockedPrisma.priceListEntry.findMany.mockResolvedValue([
      entry("e1", "A x 1 Kg.", 110),
      entry("e2", "B x 3 Kg.", 220),
      entry("e3", "C x 15 Kg.", null),
    ]);
    const second = fakeRes();
    await adjustPriceList(
      fakeReq({ params: { id: "pl-1" }, query: { dryRun: "true" }, body: { percentage: 10 } }),
      second,
    );
    expect((second.json as jest.Mock).mock.calls[0][0].rows[0].newSuggestedPrice).toBe(121);
  });

  it("writes entry.suggestedPrice AND product.suggestedPrice on apply (never provider prices)", async () => {
    const tx = {
      priceListEntry: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      product: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    mockedPrisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));

    const res = fakeRes();
    await adjustPriceList(
      fakeReq({ params: { id: "pl-1" }, query: {}, body: { percentage: 10 } }),
      res,
    );
    expect(tx.priceListEntry.updateMany).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: { suggestedPrice: 110 },
    });
    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { suggestedPrice: 110 },
    });
    // Los precios del proveedor NO se tocan: no hay escritura de priceSinIva/priceConIva.
    const entryCall = tx.priceListEntry.updateMany.mock.calls[0][0];
    expect(entryCall.data.priceConIva).toBeUndefined();
    expect(entryCall.data.priceSinIva).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(200);
    // Apply no devuelve rows.
    expect((res.json as jest.Mock).mock.calls[0][0].rows).toBeUndefined();
  });

  it("returns 404 when the plan is not found (cross-org or inexistent)", async () => {
    mockedPrisma.priceList.findFirst.mockResolvedValue(null);
    const res = fakeRes();
    await adjustPriceList(
      fakeReq({ params: { id: "pl-ajena" }, query: { dryRun: "true" }, body: { percentage: 10 } }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

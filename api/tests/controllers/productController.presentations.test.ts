/**
 * Presentaciones activas en getProducts / getProductByScan / offline snapshots
 * (sdd/product-presentations WU2, 2.6b). Sin DB.
 */
import { Request, Response } from "express";
import productController, {
  getProductByScan,
  getOfflineSnapshot,
  getOfflineProductSnapshot,
} from "../../src/controllers/productController";
import { prisma } from "../../src/config/db";

jest.mock("../../src/config/db", () => ({
  prisma: {
    product: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    productStock: { groupBy: jest.fn().mockResolvedValue([]) },
    priceKgType: { findMany: jest.fn().mockResolvedValue([]) },
    priceKgBrand: { findMany: jest.fn().mockResolvedValue([]) },
    priceKgPrice: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    category: { findMany: jest.fn().mockResolvedValue([]) },
  },
  basePrisma: {},
}));
jest.mock("../../src/config/tenantContext", () => ({
  requireOrganizationId: jest.fn().mockReturnValue("org-1"),
}));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;

const res = () => {
  const r: any = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  r.setHeader = jest.fn().mockReturnValue(r);
  return r;
};

const EXPECTED_INCLUDE = {
  where: { organizationId: "org-1", isActive: true },
  orderBy: { factor: "desc" },
  select: { id: true, name: true, factor: true, price: true, wholesalePrice: true, sortOrder: true },
};
// Decimal-like values como los devuelve Prisma
const dec = (n: number) => ({ toString: () => String(n) });
const rows = [
  { id: "pr-box", name: "Caja", factor: 10, price: dec(900), wholesalePrice: dec(700), sortOrder: 1 },
  { id: "pr-unit", name: "Unidad", factor: 1, price: dec(100), wholesalePrice: null, sortOrder: 0 },
];
const mapped = [
  { id: "pr-box", name: "Caja", factor: 10, price: 900, wholesalePrice: 700, sortOrder: 1 },
  { id: "pr-unit", name: "Unidad", factor: 1, price: 100, wholesalePrice: null, sortOrder: 0 },
];

beforeEach(() => jest.clearAllMocks());

describe("getProducts", () => {
  it("includes active presentations scoped by org and maps prices to numbers", async () => {
    db.product.findMany.mockResolvedValue([
      { id: "p-1", name: "X", price: 100, hasPresentations: true, presentations: rows },
    ]);
    const r = res();
    await productController.getProducts({ query: {} } as unknown as Request, r);
    expect(db.product.findMany.mock.calls[0][0].include.presentations).toEqual(EXPECTED_INCLUDE);
    const [item] = r.json.mock.calls[0][0];
    expect(item.hasPresentations).toBe(true);
    expect(item.presentations).toEqual(mapped);
  });
});

describe("getProductByScan", () => {
  it("returns active presentations (org + isActive filter, factor desc)", async () => {
    db.product.findFirst.mockResolvedValue({
      id: "p-1", hasPresentations: true, category: null, variantAssignments: [], presentations: rows,
    });
    const r = res();
    await getProductByScan({ params: { barcode: "BLST00008" } } as unknown as Request, r);
    expect(db.product.findFirst.mock.calls[0][0].include.presentations).toEqual(EXPECTED_INCLUDE);
    const body = r.json.mock.calls[0][0];
    expect(body.product.hasPresentations).toBe(true);
    expect(body.product.presentations).toEqual(mapped);
  });
});

describe("offline snapshots", () => {
  const base = {
    id: "p-1", name: "X", code: null, barcode: null, price: 100, description: null,
    categoryId: null, priceKgSuelto: null, priceKgSueltoManual: false, category: null,
    variantAssignments: [], hasPresentations: true, presentations: rows,
  };

  it("bulk snapshot selects and maps active presentations", async () => {
    db.product.findMany.mockResolvedValue([base]);
    const r = res();
    await getOfflineSnapshot({} as Request, r);
    const select = db.product.findMany.mock.calls[0][0].select;
    expect(select.hasPresentations).toBe(true);
    expect(select.presentations).toEqual(EXPECTED_INCLUDE);
    const [item] = r.json.mock.calls[0][0];
    expect(item.hasPresentations).toBe(true);
    expect(item.presentations).toEqual(mapped);
  });

  it("single snapshot selects and maps active presentations; plain product gets []", async () => {
    db.product.findFirst.mockResolvedValue(base);
    const r = res();
    await getOfflineProductSnapshot({ params: { id: "p-1" } } as unknown as Request, r);
    expect(db.product.findFirst.mock.calls[0][0].select.presentations).toEqual(EXPECTED_INCLUDE);
    expect(r.json.mock.calls[0][0].presentations).toEqual(mapped);

    db.product.findFirst.mockResolvedValue({ ...base, hasPresentations: false, presentations: [] });
    const r2 = res();
    await getOfflineProductSnapshot({ params: { id: "p-1" } } as unknown as Request, r2);
    expect(r2.json.mock.calls[0][0]).toMatchObject({ hasPresentations: false, presentations: [] });
  });
});

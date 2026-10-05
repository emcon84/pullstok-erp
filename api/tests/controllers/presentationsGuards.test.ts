/**
 * Guards de productos con presentaciones (sdd/product-presentations WU2, 2.6d):
 * presupuestos, pedidos, publicar en tienda y tienda pública. Sin DB.
 */
import { Request, Response } from "express";
import quotationController from "../../src/controllers/quotationController";
import orderController from "../../src/controllers/orderController";
import productController from "../../src/controllers/productController";
import storeController from "../../src/controllers/storeController";
import { prisma, basePrisma } from "../../src/config/db";

jest.mock("../../src/config/db", () => ({
  prisma: {
    product: { findFirst: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
    quotation: { findFirst: jest.fn() },
    branch: { findFirst: jest.fn() },
    productStock: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(),
  },
  basePrisma: { storeSettings: { findFirst: jest.fn(), findUnique: jest.fn() } },
}));
jest.mock("../../src/config/tenantContext", () => ({
  requireOrganizationId: jest.fn().mockReturnValue("org-1"),
}));
jest.mock("../../src/services/secuenceService", () => ({ __esModule: true, default: jest.fn().mockResolvedValue(1) }));
jest.mock("../../src/realtime/socket", () => ({ emitOrdersChanged: jest.fn(), emitProductChanged: jest.fn() }));
jest.mock("../../src/services/mailService", () => ({ sendMail: jest.fn() }));

const db = prisma as unknown as {
  product: { findFirst: jest.Mock; findMany: jest.Mock; updateMany: jest.Mock };
  $transaction: jest.Mock;
};

const res = () => {
  const r: any = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r as Response;
};

const rejected = { message: expect.stringContaining("presentaciones"), code: "PRESENTATION_NOT_SUPPORTED" };

beforeEach(() => {
  jest.clearAllMocks();
});

describe("quotation / order creation", () => {
  it("createQuotation rejects a product with presentations (400) and writes nothing", async () => {
    db.product.findFirst.mockResolvedValue({ id: "p-1", name: "Ibuprofeno" });
    const r = res();
    await quotationController.createQuotation(
      { body: { customer: "c-1", products: [{ product: "p-1", quantity: 1, price: 1 }], totalAmount: 1, validUntil: "2030-01-01" } } as Request,
      r,
    );
    expect(db.product.findFirst.mock.calls[0][0].where).toEqual({ id: { in: ["p-1"] }, hasPresentations: true });
    expect(r.status).toHaveBeenCalledWith(400);
    expect(r.json).toHaveBeenCalledWith(rejected);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("createOrder rejects a product with presentations (400) and writes nothing", async () => {
    db.product.findFirst.mockResolvedValue({ id: "p-1", name: "Ibuprofeno" });
    const r = res();
    await orderController.createOrder(
      { body: { customer: "c-1", products: [{ productId: "p-1", quantity: 1, price: 1 }], totalAmount: 1, type: "sale" } } as Request,
      r,
    );
    expect(r.status).toHaveBeenCalledWith(400);
    expect(r.json).toHaveBeenCalledWith(rejected);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe("publishProduct", () => {
  it("400 PRESENTATION_NOT_SUPPORTED when publishing a presentation product", async () => {
    db.product.findFirst.mockResolvedValue({ hasPresentations: true });
    const r = res();
    await productController.publishProduct(
      { params: { id: "p-1" }, body: { publishedToStore: true } } as unknown as Request,
      r,
    );
    expect(r.status).toHaveBeenCalledWith(400);
    expect(r.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "PRESENTATION_NOT_SUPPORTED" }),
    );
    expect(db.product.updateMany).not.toHaveBeenCalled();
  });

  it("unpublishing is always allowed", async () => {
    db.product.updateMany.mockResolvedValue({ count: 1 });
    db.product.findFirst.mockResolvedValue({ id: "p-1" });
    const r = res();
    await productController.publishProduct(
      { params: { id: "p-1" }, body: { publishedToStore: false } } as unknown as Request,
      r,
    );
    expect(r.status).toHaveBeenCalledWith(200);
  });
});

describe("public store", () => {
  const req = (extra: any = {}) =>
    ({ query: {}, params: {}, body: {}, ...extra }) as any;

  it("catalog listing and detail filter hasPresentations: false", async () => {
    (basePrisma as any).storeSettings.findUnique.mockResolvedValue({ isPublished: true });
    (basePrisma as any).storeSettings.findFirst.mockResolvedValue(null);
    db.product.findMany.mockResolvedValue([]);
    db.product.findFirst.mockResolvedValue(null);
    await storeController.getProducts(req(), res());
    await storeController.getProductById(req({ params: { id: "p-1" } }), res());
    const listWhere = db.product.findMany.mock.calls[0]?.[0]?.where;
    const detailWhere = db.product.findFirst.mock.calls[0]?.[0]?.where;
    expect(listWhere).toMatchObject({ hasPresentations: false });
    expect(detailWhere).toMatchObject({ hasPresentations: false });
  });
});

import { Request, Response } from "express";
import { prisma } from "../../src/config/db";
import { requireOrganizationId } from "../../src/config/tenantContext";
import productController from "../../src/controllers/productController";

jest.mock("../../src/config/db", () => ({
  prisma: {
    product: { findFirst: jest.fn(), updateMany: jest.fn() },
    productBarcode: {
      findFirst: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
  basePrisma: {},
}));

jest.mock("../../src/config/tenantContext", () => ({
  requireOrganizationId: jest.fn().mockReturnValue("org-1"),
}));

jest.mock("../../src/realtime/socket", () => ({ emitProductChanged: jest.fn() }));
jest.mock("../../src/services/priceLooseService", () => ({
  recomputeForProduct: jest.fn(),
  recomputeForBulkPriceUpdate: jest.fn(),
  recomputeForCsvImport: jest.fn(),
}));

const db = prisma as unknown as {
  product: { findFirst: jest.Mock; updateMany: jest.Mock };
  productBarcode: { findFirst: jest.Mock; create: jest.Mock; deleteMany: jest.Mock };
};

const req = (params: any, body?: any) => ({ params, body } as unknown as Request);
const mockRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response & { status: jest.Mock; json: jest.Mock };
};

describe("productController.addProductBarcode", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (requireOrganizationId as jest.Mock).mockReturnValue("org-1");
  });

  it("400 when code is empty after trim", async () => {
    const res = mockRes();
    await productController.addProductBarcode(req({ id: "p1" }, { code: "   " }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.productBarcode.create).not.toHaveBeenCalled();
  });

  it("404 when product is not in the org", async () => {
    db.product.findFirst.mockResolvedValueOnce(null);
    const res = mockRes();
    await productController.addProductBarcode(req({ id: "p1" }, { code: "123" }), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(db.productBarcode.create).not.toHaveBeenCalled();
  });

  it("409 when code equals a primary Product.barcode (including its own)", async () => {
    db.product.findFirst
      .mockResolvedValueOnce({ id: "p1" }) // product exists
      .mockResolvedValueOnce({ id: "p1" }); // primary barcode owner
    const res = mockRes();
    await productController.addProductBarcode(req({ id: "p1" }, { code: "123" }), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(db.productBarcode.create).not.toHaveBeenCalled();
  });

  it("409 when code is already an alias", async () => {
    db.product.findFirst.mockResolvedValueOnce({ id: "p1" }).mockResolvedValueOnce(null);
    db.productBarcode.findFirst.mockResolvedValueOnce({ id: "b9" });
    const res = mockRes();
    await productController.addProductBarcode(req({ id: "p1" }, { code: "123" }), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(db.productBarcode.create).not.toHaveBeenCalled();
  });

  it("201 creates the alias with the trimmed code", async () => {
    db.product.findFirst.mockResolvedValueOnce({ id: "p1" }).mockResolvedValueOnce(null);
    db.productBarcode.findFirst.mockResolvedValueOnce(null);
    db.productBarcode.create.mockResolvedValueOnce({ id: "b1", code: "123" });
    const res = mockRes();
    await productController.addProductBarcode(req({ id: "p1" }, { code: " 123 " }), res);
    expect(db.productBarcode.create).toHaveBeenCalledWith({
      data: { organizationId: "org-1", productId: "p1", code: "123" },
      select: { id: true, code: true },
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ id: "b1", code: "123" });
  });

  it("409 when the unique index rejects a concurrent insert (P2002)", async () => {
    db.product.findFirst.mockResolvedValueOnce({ id: "p1" }).mockResolvedValueOnce(null);
    db.productBarcode.findFirst.mockResolvedValueOnce(null);
    db.productBarcode.create.mockRejectedValueOnce({ code: "P2002" });
    const res = mockRes();
    await productController.addProductBarcode(req({ id: "p1" }, { code: "123" }), res);
    expect(res.status).toHaveBeenCalledWith(409);
  });
});

describe("productController.deleteProductBarcode", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (requireOrganizationId as jest.Mock).mockReturnValue("org-1");
  });

  it("404 when nothing was deleted", async () => {
    db.productBarcode.deleteMany.mockResolvedValueOnce({ count: 0 });
    const res = mockRes();
    await productController.deleteProductBarcode(req({ id: "p1", barcodeId: "b1" }), res);
    expect(db.productBarcode.deleteMany).toHaveBeenCalledWith({
      where: { id: "b1", productId: "p1" },
    });
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("204 when deleted", async () => {
    db.productBarcode.deleteMany.mockResolvedValueOnce({ count: 1 });
    const res: any = mockRes();
    res.send = jest.fn();
    await productController.deleteProductBarcode(req({ id: "p1", barcodeId: "b1" }), res);
    expect(res.status).toHaveBeenCalledWith(204);
  });
});

describe("productController.updateProduct — alias barcode conflict", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (requireOrganizationId as jest.Mock).mockReturnValue("org-1");
  });

  it("409 when the new barcode is an alias of ANOTHER product", async () => {
    db.productBarcode.findFirst.mockResolvedValueOnce({ id: "b1" });
    const res = mockRes();
    await productController.updateProduct(
      req({ id: "p1" }, { barcode: "999" }),
      res,
    );
    expect(db.productBarcode.findFirst).toHaveBeenCalledWith({
      where: { code: "999", productId: { not: "p1" } },
      select: { id: true },
    });
    expect(res.status).toHaveBeenCalledWith(409);
    expect(db.product.updateMany).not.toHaveBeenCalled();
  });
});

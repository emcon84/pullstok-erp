import { Request, Response } from "express";
import {
  getPriceKgPlan,
  savePriceKgPlan,
} from "../../src/controllers/priceKgPlanController";
import { prisma } from "../../src/config/db";

jest.mock("../../src/config/db", () => ({
  prisma: {
    priceKgPrice: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock("../../src/config/tenantContext", () => ({
  requireOrganizationId: jest.fn().mockReturnValue("org-1"),
}));

const mockedPrisma = prisma as unknown as {
  priceKgPrice: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    updateMany: jest.Mock;
    deleteMany: jest.Mock;
  };
  $transaction: jest.Mock;
};

const mockTx = {
  priceKgPrice: {
    findFirst: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
  },
};

const mockRequest = (params: any = {}, body: any = {}) =>
  ({ params, body } as unknown as Request);

const mockResponse = () => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("PriceKgPlan Controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedPrisma.$transaction.mockImplementation(
      async (cb: (tx: any) => unknown) => cb(mockTx),
    );
  });

  describe("getPriceKgPlan", () => {
    it("returns every cell (id/brandId/typeId/priceKg) of the org", async () => {
      const items = [
        { id: "c1", brandId: "b1", typeId: "t1", priceKg: 5500 },
        { id: "c2", brandId: "b2", typeId: "t1", priceKg: 3000 },
      ];
      mockedPrisma.priceKgPrice.findMany.mockResolvedValue(items);

      const req = mockRequest();
      const res = mockResponse();
      await getPriceKgPlan(req, res);

      expect(mockedPrisma.priceKgPrice.findMany).toHaveBeenCalledWith({
        where: { organizationId: "org-1" },
        select: { id: true, brandId: true, typeId: true, priceKg: true },
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ items });
    });

    it("returns 500 on DB error", async () => {
      mockedPrisma.priceKgPrice.findMany.mockRejectedValue(new Error("DB down"));

      const req = mockRequest();
      const res = mockResponse();
      await getPriceKgPlan(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("savePriceKgPlan", () => {
    it("deletes the cell when priceKg is null", async () => {
      mockTx.priceKgPrice.deleteMany.mockResolvedValue({ count: 1 });

      const req = mockRequest({}, { entries: [{ brandId: "b1", typeId: "t1", priceKg: null }] });
      const res = mockResponse();
      await savePriceKgPlan(req, res);

      expect(mockedPrisma.$transaction).toHaveBeenCalledWith(expect.any(Function));
      expect(mockTx.priceKgPrice.deleteMany).toHaveBeenCalledWith({
        where: { brandId: "b1", typeId: "t1", organizationId: "org-1" },
      });
      expect(mockTx.priceKgPrice.updateMany).not.toHaveBeenCalled();
      expect(mockTx.priceKgPrice.create).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ saved: 1 });
    });

    it("updates the cell when it already exists", async () => {
      mockTx.priceKgPrice.findFirst.mockResolvedValue({ id: "c1" });
      mockTx.priceKgPrice.updateMany.mockResolvedValue({ count: 1 });

      const req = mockRequest({}, { entries: [{ brandId: "b1", typeId: "t1", priceKg: 5500 }] });
      const res = mockResponse();
      await savePriceKgPlan(req, res);

      expect(mockTx.priceKgPrice.findFirst).toHaveBeenCalledWith({
        where: { brandId: "b1", typeId: "t1", organizationId: "org-1" },
        select: { id: true },
      });
      expect(mockTx.priceKgPrice.updateMany).toHaveBeenCalledWith({
        where: { brandId: "b1", typeId: "t1", organizationId: "org-1" },
        data: { priceKg: 5500 },
      });
      expect(mockTx.priceKgPrice.create).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ saved: 1 });
    });

    it("creates the cell when it does not exist", async () => {
      mockTx.priceKgPrice.findFirst.mockResolvedValue(null);
      mockTx.priceKgPrice.create.mockResolvedValue({ id: "c-new" });

      const req = mockRequest({}, { entries: [{ brandId: "b1", typeId: "t1", priceKg: 3000 }] });
      const res = mockResponse();
      await savePriceKgPlan(req, res);

      expect(mockTx.priceKgPrice.create).toHaveBeenCalledWith({
        data: {
          brandId: "b1",
          typeId: "t1",
          priceKg: 3000,
          organizationId: "org-1",
        },
      });
      expect(mockTx.priceKgPrice.updateMany).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ saved: 1 });
    });

    it("rounds priceKg to 2 decimals", async () => {
      mockTx.priceKgPrice.findFirst.mockResolvedValue(null);
      mockTx.priceKgPrice.create.mockResolvedValue({ id: "c-new" });

      const req = mockRequest(
        {},
        { entries: [{ brandId: "b1", typeId: "t1", priceKg: 5500.567 }] },
      );
      const res = mockResponse();
      await savePriceKgPlan(req, res);

      expect(mockTx.priceKgPrice.create).toHaveBeenCalledWith({
        data: {
          brandId: "b1",
          typeId: "t1",
          priceKg: 5500.57,
          organizationId: "org-1",
        },
      });
    });

    it("returns 400 on error", async () => {
      mockedPrisma.$transaction.mockRejectedValue(new Error("FK failed"));

      const req = mockRequest({}, { entries: [{ brandId: "b1", typeId: "t1", priceKg: 1 }] });
      const res = mockResponse();
      await savePriceKgPlan(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});

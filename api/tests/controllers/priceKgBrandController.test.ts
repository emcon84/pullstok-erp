import { Request, Response } from "express";
import {
  listPriceKgBrands,
  createPriceKgBrand,
  updatePriceKgBrand,
  deletePriceKgBrand,
} from "../../src/controllers/priceKgBrandController";
import { prisma } from "../../src/config/db";

jest.mock("../../src/config/db", () => ({
  prisma: {
    priceKgBrand: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

jest.mock("../../src/config/tenantContext", () => ({
  requireOrganizationId: jest.fn().mockReturnValue("org-1"),
}));

const mockedPrisma = prisma as unknown as {
  priceKgBrand: {
    findMany: jest.Mock;
    create: jest.Mock;
    findFirst: jest.Mock;
    updateMany: jest.Mock;
    deleteMany: jest.Mock;
  };
};

const mockRequest = (params: any = {}, body: any = {}) =>
  ({ params, body } as unknown as Request);

const mockResponse = () => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("PriceKgBrand Controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("listPriceKgBrands", () => {
    it("lists brands ordered by name asc with id/name/keywords", async () => {
      const items = [
        { id: "b1", name: "MAXXIUM CORDERO", keywords: ["MAXXIUM", "CORDERO"] },
        { id: "b2", name: "OLD PRINCE PREMIUM", keywords: ["OLD PRINCE", "PREMIUM"] },
      ];
      mockedPrisma.priceKgBrand.findMany.mockResolvedValue(items);

      const req = mockRequest();
      const res = mockResponse();
      await listPriceKgBrands(req, res);

      expect(mockedPrisma.priceKgBrand.findMany).toHaveBeenCalledWith({
        where: { organizationId: "org-1" },
        orderBy: { name: "asc" },
        select: { id: true, name: true, keywords: true },
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ items });
    });

    it("returns 500 on DB error", async () => {
      mockedPrisma.priceKgBrand.findMany.mockRejectedValue(new Error("DB down"));

      const req = mockRequest();
      const res = mockResponse();
      await listPriceKgBrands(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("createPriceKgBrand", () => {
    it("creates a brand with explicit organizationId and returns 201", async () => {
      const body = { name: "MAXXIUM CORDERO", keywords: ["MAXXIUM", "CORDERO"] };
      const created = { id: "b1", ...body, organizationId: "org-1" };
      mockedPrisma.priceKgBrand.create.mockResolvedValue(created);

      const req = mockRequest({}, body);
      const res = mockResponse();
      await createPriceKgBrand(req, res);

      expect(mockedPrisma.priceKgBrand.create).toHaveBeenCalledWith({
        data: { name: "MAXXIUM CORDERO", keywords: ["MAXXIUM", "CORDERO"], organizationId: "org-1" },
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(created);
    });

    it("returns 400 on duplicate name (Unique constraint)", async () => {
      mockedPrisma.priceKgBrand.create.mockRejectedValue(
        new Error("Unique constraint failed"),
      );

      const req = mockRequest({}, { name: "MAXXIUM", keywords: [] });
      const res = mockResponse();
      await createPriceKgBrand(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "Ya existe una marca con ese nombre" });
    });

    it("returns 400 on generic error", async () => {
      mockedPrisma.priceKgBrand.create.mockRejectedValue(new Error("boom"));

      const req = mockRequest({}, { name: "X", keywords: [] });
      const res = mockResponse();
      await createPriceKgBrand(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe("updatePriceKgBrand", () => {
    it("updates an existing brand and returns 200", async () => {
      mockedPrisma.priceKgBrand.findFirst.mockResolvedValueOnce({ id: "b1", name: "MAXXIUM" });
      mockedPrisma.priceKgBrand.updateMany.mockResolvedValue({ count: 1 });
      const updated = { id: "b1", name: "MAXXIUM", keywords: ["MAXXIUM", "CORDERO"] };
      mockedPrisma.priceKgBrand.findFirst.mockResolvedValueOnce(updated);

      const req = mockRequest({ id: "b1" }, { keywords: ["MAXXIUM", "CORDERO"] });
      const res = mockResponse();
      await updatePriceKgBrand(req, res);

      expect(mockedPrisma.priceKgBrand.findFirst).toHaveBeenCalledWith({ where: { id: "b1" } });
      expect(mockedPrisma.priceKgBrand.updateMany).toHaveBeenCalledWith({
        where: { id: "b1" },
        data: { keywords: ["MAXXIUM", "CORDERO"] },
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(updated);
    });

    it("returns 404 when the brand does not exist", async () => {
      mockedPrisma.priceKgBrand.findFirst.mockResolvedValue(null);

      const req = mockRequest({ id: "missing" }, { name: "X" });
      const res = mockResponse();
      await updatePriceKgBrand(req, res);

      expect(mockedPrisma.priceKgBrand.updateMany).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: "Marca no encontrada" });
    });

    it("returns 400 on duplicate name during update", async () => {
      mockedPrisma.priceKgBrand.findFirst.mockResolvedValue({ id: "b1" });
      mockedPrisma.priceKgBrand.updateMany.mockRejectedValue(
        new Error("Unique constraint failed"),
      );

      const req = mockRequest({ id: "b1" }, { name: "MAXXIUM" });
      const res = mockResponse();
      await updatePriceKgBrand(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "Ya existe una marca con ese nombre" });
    });
  });

  describe("deletePriceKgBrand", () => {
    it("deletes a brand and returns 200", async () => {
      mockedPrisma.priceKgBrand.deleteMany.mockResolvedValue({ count: 1 });

      const req = mockRequest({ id: "b1" });
      const res = mockResponse();
      await deletePriceKgBrand(req, res);

      expect(mockedPrisma.priceKgBrand.deleteMany).toHaveBeenCalledWith({ where: { id: "b1" } });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: "Marca eliminada" });
    });

    it("returns 404 when the brand does not exist (count 0)", async () => {
      mockedPrisma.priceKgBrand.deleteMany.mockResolvedValue({ count: 0 });

      const req = mockRequest({ id: "missing" });
      const res = mockResponse();
      await deletePriceKgBrand(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: "Marca no encontrada" });
    });
  });
});

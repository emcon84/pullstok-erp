import { Request, Response } from "express";
import {
  listPriceKgTypes,
  createPriceKgType,
  updatePriceKgType,
  deletePriceKgType,
} from "../../src/controllers/priceKgTypeController";
import { prisma } from "../../src/config/db";

jest.mock("../../src/config/db", () => ({
  prisma: {
    priceKgType: {
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
  priceKgType: {
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

describe("PriceKgType Controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("listPriceKgTypes", () => {
    it("lists types ordered by name asc with id/name/synonyms", async () => {
      const items = [
        { id: "t1", name: "Adulto", synonyms: ["ADULTO", "ADULTOS"] },
        { id: "t2", name: "Cachorro", synonyms: ["CACHORRO"] },
      ];
      mockedPrisma.priceKgType.findMany.mockResolvedValue(items);

      const req = mockRequest();
      const res = mockResponse();
      await listPriceKgTypes(req, res);

      expect(mockedPrisma.priceKgType.findMany).toHaveBeenCalledWith({
        where: { organizationId: "org-1" },
        orderBy: { name: "asc" },
        select: { id: true, name: true, synonyms: true },
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ items });
    });

    it("returns 500 on DB error", async () => {
      mockedPrisma.priceKgType.findMany.mockRejectedValue(new Error("DB down"));

      const req = mockRequest();
      const res = mockResponse();
      await listPriceKgTypes(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("createPriceKgType", () => {
    it("creates a type with explicit organizationId and returns 201", async () => {
      const body = { name: "Adulto", synonyms: ["ADULTO"] };
      const created = { id: "t1", ...body, organizationId: "org-1" };
      mockedPrisma.priceKgType.create.mockResolvedValue(created);

      const req = mockRequest({}, body);
      const res = mockResponse();
      await createPriceKgType(req, res);

      expect(mockedPrisma.priceKgType.create).toHaveBeenCalledWith({
        data: { name: "Adulto", synonyms: ["ADULTO"], organizationId: "org-1" },
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(created);
    });

    it("returns 400 on duplicate name (Unique constraint)", async () => {
      mockedPrisma.priceKgType.create.mockRejectedValue(
        new Error("Unique constraint failed"),
      );

      const req = mockRequest({}, { name: "Adulto", synonyms: [] });
      const res = mockResponse();
      await createPriceKgType(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "Ya existe un tipo con ese nombre" });
    });

    it("returns 400 on generic error", async () => {
      mockedPrisma.priceKgType.create.mockRejectedValue(new Error("boom"));

      const req = mockRequest({}, { name: "X", synonyms: [] });
      const res = mockResponse();
      await createPriceKgType(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe("updatePriceKgType", () => {
    it("updates an existing type and returns 200", async () => {
      mockedPrisma.priceKgType.findFirst.mockResolvedValueOnce({ id: "t1", name: "Adulto" });
      mockedPrisma.priceKgType.updateMany.mockResolvedValue({ count: 1 });
      const updated = { id: "t1", name: "Adulto", synonyms: ["ADULTO", "ADULTOS"] };
      mockedPrisma.priceKgType.findFirst.mockResolvedValueOnce(updated);

      const req = mockRequest({ id: "t1" }, { synonyms: ["ADULTO", "ADULTOS"] });
      const res = mockResponse();
      await updatePriceKgType(req, res);

      expect(mockedPrisma.priceKgType.findFirst).toHaveBeenCalledWith({ where: { id: "t1" } });
      expect(mockedPrisma.priceKgType.updateMany).toHaveBeenCalledWith({
        where: { id: "t1" },
        data: { synonyms: ["ADULTO", "ADULTOS"] },
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(updated);
    });

    it("returns 404 when the type does not exist", async () => {
      mockedPrisma.priceKgType.findFirst.mockResolvedValue(null);

      const req = mockRequest({ id: "missing" }, { name: "X" });
      const res = mockResponse();
      await updatePriceKgType(req, res);

      expect(mockedPrisma.priceKgType.updateMany).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: "Tipo no encontrado" });
    });

    it("returns 400 on duplicate name during update", async () => {
      mockedPrisma.priceKgType.findFirst.mockResolvedValue({ id: "t1" });
      mockedPrisma.priceKgType.updateMany.mockRejectedValue(
        new Error("Unique constraint failed"),
      );

      const req = mockRequest({ id: "t1" }, { name: "Adulto" });
      const res = mockResponse();
      await updatePriceKgType(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "Ya existe un tipo con ese nombre" });
    });
  });

  describe("deletePriceKgType", () => {
    it("deletes a type and returns 200", async () => {
      mockedPrisma.priceKgType.deleteMany.mockResolvedValue({ count: 1 });

      const req = mockRequest({ id: "t1" });
      const res = mockResponse();
      await deletePriceKgType(req, res);

      expect(mockedPrisma.priceKgType.deleteMany).toHaveBeenCalledWith({ where: { id: "t1" } });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: "Tipo eliminado" });
    });

    it("returns 404 when the type does not exist (count 0)", async () => {
      mockedPrisma.priceKgType.deleteMany.mockResolvedValue({ count: 0 });

      const req = mockRequest({ id: "missing" });
      const res = mockResponse();
      await deletePriceKgType(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: "Tipo no encontrado" });
    });
  });
});

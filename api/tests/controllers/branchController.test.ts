import { Request, Response } from "express";
import {
  createBranch,
  listBranches,
  updateBranch,
  toggleBranchActive,
  deleteBranch,
} from "../../src/controllers/branchController";
import { prisma } from "../../src/config/db";

jest.mock("../../src/config/db", () => ({
  prisma: {
    branch: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

const mockedPrisma = prisma as unknown as {
  branch: {
    create: jest.Mock;
    findMany: jest.Mock;
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

describe("Branch Controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createBranch", () => {
    it("creates a branch and returns 201", async () => {
      const body = { name: "Sucursal Centro" };
      const created = { id: "b1", ...body, address: null, phone: null, isActive: true, createdAt: new Date(), organizationId: "org-1" };
      mockedPrisma.branch.create.mockResolvedValue(created);

      const req = mockRequest({}, body);
      const res = mockResponse();

      await createBranch(req, res);

      expect(mockedPrisma.branch.create).toHaveBeenCalledWith({ data: body });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(created);
    });

    it("creates branch with all optional fields", async () => {
      const body = { name: "Sucursal Norte", address: "Av. 123", phone: "111" };
      const created = { id: "b2", ...body, isActive: true, createdAt: new Date(), organizationId: "org-1" };
      mockedPrisma.branch.create.mockResolvedValue(created);

      const req = mockRequest({}, body);
      const res = mockResponse();

      await createBranch(req, res);

      expect(mockedPrisma.branch.create).toHaveBeenCalledWith({ data: body });
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it("returns 400 on Prisma error (e.g. duplicate name)", async () => {
      mockedPrisma.branch.create.mockRejectedValue(new Error("Unique constraint failed"));

      const req = mockRequest({}, { name: "Central" });
      const res = mockResponse();

      await createBranch(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "Ya existe una sucursal con ese nombre" });
    });

    it("returns 400 on generic error", async () => {
      mockedPrisma.branch.create.mockRejectedValue(new Error("Some other error"));

      const req = mockRequest({}, { name: "X" });
      const res = mockResponse();

      await createBranch(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe("listBranches", () => {
    it("returns 200 with active branches", async () => {
      const branches = [{ id: "b1", name: "Centro" }, { id: "b2", name: "Norte" }];
      mockedPrisma.branch.findMany.mockResolvedValue(branches);

      const req = mockRequest();
      const res = mockResponse();

      await listBranches(req, res);

      expect(mockedPrisma.branch.findMany).toHaveBeenCalledWith({ where: { isActive: true } });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(branches);
    });

    it("returns 200 with empty array when no branches", async () => {
      mockedPrisma.branch.findMany.mockResolvedValue([]);

      const req = mockRequest();
      const res = mockResponse();

      await listBranches(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith([]);
    });

    it("returns 500 on DB error", async () => {
      mockedPrisma.branch.findMany.mockRejectedValue(new Error("DB down"));

      const req = mockRequest();
      const res = mockResponse();

      await listBranches(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("updateBranch", () => {
    it("updates a branch and returns 200", async () => {
      const updated = { id: "b1", name: "Sucursal Norte", address: null, phone: null };
      mockedPrisma.branch.updateMany.mockResolvedValue({ count: 1 });
      mockedPrisma.branch.findFirst.mockResolvedValue(updated);

      const req = mockRequest({ id: "b1" }, { name: "Sucursal Norte" });
      const res = mockResponse();

      await updateBranch(req, res);

      expect(mockedPrisma.branch.updateMany).toHaveBeenCalledWith({
        where: { id: "b1" },
        data: { name: "Sucursal Norte" },
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(updated);
    });

    it("returns 404 when branch not found", async () => {
      mockedPrisma.branch.updateMany.mockResolvedValue({ count: 0 });

      const req = mockRequest({ id: "nonexistent" }, { name: "X" });
      const res = mockResponse();

      await updateBranch(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: "Sucursal no encontrada" });
    });
  });

  describe("toggleBranchActive", () => {
    it("toggles active status and returns 200", async () => {
      mockedPrisma.branch.findFirst.mockResolvedValue({
        id: "b1",
        isHeadquarters: false,
      });
      mockedPrisma.branch.updateMany.mockResolvedValue({ count: 1 });

      const req = mockRequest({ id: "b1" }, { isActive: false });
      const res = mockResponse();

      await toggleBranchActive(req, res);

      expect(mockedPrisma.branch.findFirst).toHaveBeenCalledWith({ where: { id: "b1" } });
      expect(mockedPrisma.branch.updateMany).toHaveBeenCalledWith({
        where: { id: "b1" },
        data: { isActive: false },
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: "Sucursal actualizada" });
    });

    it("returns 400 when trying to deactivate the headquarters branch", async () => {
      mockedPrisma.branch.findFirst.mockResolvedValue({
        id: "b-hq",
        isHeadquarters: true,
      });

      const req = mockRequest({ id: "b-hq" }, { isActive: false });
      const res = mockResponse();

      await toggleBranchActive(req, res);

      expect(mockedPrisma.branch.updateMany).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "No se puede desactivar/eliminar la casa central",
      });
    });

    it("allows re-activating the headquarters branch", async () => {
      mockedPrisma.branch.findFirst.mockResolvedValue({
        id: "b-hq",
        isHeadquarters: true,
      });
      mockedPrisma.branch.updateMany.mockResolvedValue({ count: 1 });

      const req = mockRequest({ id: "b-hq" }, { isActive: true });
      const res = mockResponse();

      await toggleBranchActive(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockedPrisma.branch.updateMany).toHaveBeenCalledWith({
        where: { id: "b-hq" },
        data: { isActive: true },
      });
    });

    it("returns 404 when branch not found", async () => {
      mockedPrisma.branch.findFirst.mockResolvedValue(null);

      const req = mockRequest({ id: "nonexistent" }, { isActive: false });
      const res = mockResponse();

      await toggleBranchActive(req, res);

      expect(mockedPrisma.branch.updateMany).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe("deleteBranch", () => {
    it("deletes a branch and returns 200", async () => {
      mockedPrisma.branch.findFirst.mockResolvedValue({
        id: "b1",
        isHeadquarters: false,
      });
      mockedPrisma.branch.deleteMany.mockResolvedValue({ count: 1 });

      const req = mockRequest({ id: "b1" });
      const res = mockResponse();

      await deleteBranch(req, res);

      expect(mockedPrisma.branch.findFirst).toHaveBeenCalledWith({ where: { id: "b1" } });
      expect(mockedPrisma.branch.deleteMany).toHaveBeenCalledWith({ where: { id: "b1" } });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: "Sucursal eliminada" });
    });

    it("returns 400 when trying to delete the headquarters branch", async () => {
      mockedPrisma.branch.findFirst.mockResolvedValue({
        id: "b-hq",
        isHeadquarters: true,
      });

      const req = mockRequest({ id: "b-hq" });
      const res = mockResponse();

      await deleteBranch(req, res);

      expect(mockedPrisma.branch.deleteMany).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "No se puede desactivar/eliminar la casa central",
      });
    });

    it("returns 404 when branch not found", async () => {
      mockedPrisma.branch.findFirst.mockResolvedValue(null);

      const req = mockRequest({ id: "nonexistent" });
      const res = mockResponse();

      await deleteBranch(req, res);

      expect(mockedPrisma.branch.deleteMany).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(404);
    });
  });
});

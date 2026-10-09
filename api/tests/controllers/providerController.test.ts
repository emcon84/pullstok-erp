import { Request, Response } from "express";
import providerController from "../../src/controllers/providerController";
import { prisma } from "../../src/config/db";

jest.mock("../../src/config/db", () => ({
  prisma: {
    provider: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    account: { findFirst: jest.fn() },
  },
}));

jest.mock("../../src/config/tenantContext", () => ({
  requireOrganizationId: jest.fn(() => "org-1"),
}));

const p = (prisma as any).provider as Record<string, jest.Mock>;
const acc = (prisma as any).account as Record<string, jest.Mock>;

const mockRequest = (params: any = {}, body: any = {}, query: any = {}) =>
  ({ params, body, query } as unknown as Request);

const mockResponse = () => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("Provider Controller", () => {
  beforeEach(() => {
    // reset solo de los mocks de provider: resetAllMocks borraría el mock de tenantContext.
    Object.values(p).forEach((m) => m.mockReset());
    Object.values(acc).forEach((m) => m.mockReset());
  });

  describe("listProviders", () => {
    it("devuelve { items } scopeado por org y ordenado por nombre", async () => {
      p.findMany.mockResolvedValue([{ id: "p1", name: "A" }]);
      const res = mockResponse();
      await providerController.listProviders(mockRequest(), res);
      expect(p.findMany).toHaveBeenCalledWith({
        where: { organizationId: "org-1" },
        orderBy: { name: "asc" },
        include: { account: { select: { id: true, code: true, shortCode: true, name: true } } },
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ items: [{ id: "p1", name: "A" }] });
    });

    it("aplica filtro de activos y búsqueda por nombre/código/CUIT", async () => {
      p.findMany.mockResolvedValue([]);
      await providerController.listProviders(
        mockRequest({}, {}, { q: " 3012 ", active: "true" }),
        mockResponse(),
      );
      const where = p.findMany.mock.calls[0][0].where;
      expect(where.isActive).toBe(true);
      expect(where.OR).toEqual([
        { name: { contains: "3012", mode: "insensitive" } },
        { code: { contains: "3012", mode: "insensitive" } },
        { taxId: { contains: "3012", mode: "insensitive" } },
      ]);
    });

    it("active=false lista solo inactivos", async () => {
      p.findMany.mockResolvedValue([]);
      await providerController.listProviders(mockRequest({}, {}, { active: "false" }), mockResponse());
      expect(p.findMany.mock.calls[0][0].where.isActive).toBe(false);
    });

    it("500 si Prisma falla", async () => {
      jest.spyOn(console, "error").mockImplementation(() => {});
      p.findMany.mockRejectedValue(new Error("x"));
      const res = mockResponse();
      await providerController.listProviders(mockRequest(), res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("createProvider", () => {
    it("crea con organizationId y devuelve 201", async () => {
      p.findFirst.mockResolvedValue(null);
      p.create.mockResolvedValue({ id: "p1", name: "Nuevo" });
      const res = mockResponse();
      await providerController.createProvider(mockRequest({}, { name: "Nuevo", code: "P1" }), res);
      expect(p.create).toHaveBeenCalledWith({
        data: { name: "Nuevo", code: "P1", organizationId: "org-1" },
        include: expect.any(Object),
      });
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it("400 si la cuenta contable no existe en la org", async () => {
      p.findFirst.mockResolvedValue(null);
      acc.findFirst.mockResolvedValue(null);
      const res = mockResponse();
      await providerController.createProvider(mockRequest({}, { name: "N", accountId: "a1" }), res);
      expect(acc.findFirst.mock.calls[0][0].where).toEqual({ id: "a1", organizationId: "org-1" });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "La cuenta contable no existe" });
      expect(p.create).not.toHaveBeenCalled();
    });

    it("400 si la cuenta contable no es imputable", async () => {
      p.findFirst.mockResolvedValue(null);
      acc.findFirst.mockResolvedValue({ isPostable: false });
      const res = mockResponse();
      await providerController.createProvider(mockRequest({}, { name: "N", accountId: "a1" }), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "La cuenta contable debe ser imputable" });
    });

    it("crea con cuenta contable imputable", async () => {
      p.findFirst.mockResolvedValue(null);
      acc.findFirst.mockResolvedValue({ isPostable: true });
      p.create.mockResolvedValue({ id: "p1" });
      const res = mockResponse();
      await providerController.createProvider(mockRequest({}, { name: "N", accountId: "a1" }), res);
      expect(p.create.mock.calls[0][0].data.accountId).toBe("a1");
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it("409 si el nombre ya existe ignorando mayúsculas", async () => {
      p.findFirst.mockResolvedValue({ id: "otro" });
      const res = mockResponse();
      await providerController.createProvider(mockRequest({}, { name: "alican" }), res);
      expect(p.findFirst.mock.calls[0][0].where.name).toEqual({ equals: "alican", mode: "insensitive" });
      expect(res.status).toHaveBeenCalledWith(409);
      expect(p.create).not.toHaveBeenCalled();
    });

    it("409 si el código legado ya existe (P2002)", async () => {
      p.findFirst.mockResolvedValue(null);
      p.create.mockRejectedValue({ code: "P2002", meta: { target: ["organizationId", "code"] } });
      const res = mockResponse();
      await providerController.createProvider(mockRequest({}, { name: "X", code: "P1" }), res);
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({ message: "Ya existe un proveedor con ese código" });
    });
  });

  describe("updateProvider", () => {
    it("actualiza con updateMany scopeado y devuelve el proveedor", async () => {
      p.updateMany.mockResolvedValue({ count: 1 });
      p.findFirst.mockResolvedValue({ id: "p1", isActive: false });
      const res = mockResponse();
      await providerController.updateProvider(mockRequest({ id: "p1" }, { isActive: false }), res);
      expect(p.updateMany).toHaveBeenCalledWith({
        where: { id: "p1", organizationId: "org-1" },
        data: { isActive: false },
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ id: "p1", isActive: false });
    });

    it("404 si no existe en la org", async () => {
      p.updateMany.mockResolvedValue({ count: 0 });
      const res = mockResponse();
      await providerController.updateProvider(mockRequest({ id: "zz" }, { phone: "1" }), res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("409 si renombra a un nombre que ya usa otro proveedor", async () => {
      p.findFirst.mockResolvedValue({ id: "otro" });
      const res = mockResponse();
      await providerController.updateProvider(mockRequest({ id: "p1" }, { name: "Dup" }), res);
      expect(p.findFirst.mock.calls[0][0].where.id).toEqual({ not: "p1" });
      expect(res.status).toHaveBeenCalledWith(409);
      expect(p.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("getProviderById / deleteProvider", () => {
    it("get: 200 / 404", async () => {
      p.findFirst.mockResolvedValueOnce({ id: "p1" }).mockResolvedValueOnce(null);
      const ok = mockResponse();
      await providerController.getProviderById(mockRequest({ id: "p1" }), ok);
      expect(ok.status).toHaveBeenCalledWith(200);
      const nf = mockResponse();
      await providerController.getProviderById(mockRequest({ id: "p2" }), nf);
      expect(nf.status).toHaveBeenCalledWith(404);
    });

    it("delete: deleteMany scopeado, 404 si count 0", async () => {
      p.deleteMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
      const ok = mockResponse();
      await providerController.deleteProvider(mockRequest({ id: "p1" }), ok);
      expect(p.deleteMany).toHaveBeenCalledWith({ where: { id: "p1", organizationId: "org-1" } });
      expect(ok.status).toHaveBeenCalledWith(200);
      const nf = mockResponse();
      await providerController.deleteProvider(mockRequest({ id: "p2" }), nf);
      expect(nf.status).toHaveBeenCalledWith(404);
    });
  });
});

import { Request, Response } from "express";
import { createHash } from "crypto";
import {
  createPrinter,
  listPrinters,
  updatePrinter,
  deletePrinter,
  listAgents,
  createPairingCode,
} from "../../src/controllers/printerController";
import { prisma } from "../../src/config/db";
import { runWithTenant } from "../../src/config/tenantContext";

jest.mock("../../src/config/db", () => ({
  prisma: {
    printer: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    printAgent: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() },
    branch: { findFirst: jest.fn() },
  },
}));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;

const mockRequest = (params: any = {}, body: any = {}) =>
  ({ params, body } as unknown as Request);

const mockResponse = () => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

// requireOrganizationId necesita contexto de tenant (AsyncLocalStorage).
const inOrg = <T>(fn: () => T): T =>
  runWithTenant({ userId: "u1", role: "ADMIN", organizationId: "org-1" }, fn);

describe("Printer Controller", () => {
  beforeEach(() => jest.resetAllMocks());

  describe("createPrinter", () => {
    it("creates a printer in the caller org and returns 201", async () => {
      const body = { name: "Caja 1", localName: "POS-80" };
      const created = { id: "p1", ...body };
      db.printer.create.mockResolvedValue(created);
      const res = mockResponse();

      await inOrg(() => createPrinter(mockRequest({}, body), res));

      expect(db.printer.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ name: "Caja 1", localName: "POS-80", organizationId: "org-1" }),
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(created);
    });

    it("404 when the branch is not in the org", async () => {
      db.branch.findFirst.mockResolvedValue(null);
      const res = mockResponse();

      await inOrg(() => createPrinter(mockRequest({}, { name: "X", branchId: "b-otra" }), res));

      expect(db.printer.create).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("404 when the agent is not in the org", async () => {
      db.printAgent.findFirst.mockResolvedValue(null);
      const res = mockResponse();

      await inOrg(() => createPrinter(mockRequest({}, { name: "X", agentId: "a-otro" }), res));

      expect(db.printer.create).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("409 on duplicate name", async () => {
      db.printer.create.mockRejectedValue(
        Object.assign(new Error("Unique constraint failed"), { code: "P2002" }),
      );
      const res = mockResponse();

      await inOrg(() => createPrinter(mockRequest({}, { name: "Caja 1" }), res));

      expect(res.status).toHaveBeenCalledWith(409);
    });
  });

  describe("listPrinters", () => {
    it("flags the agent as online when lastSeenAt is < 90s ago", async () => {
      const now = Date.now();
      db.printer.findMany.mockResolvedValue([
        { id: "p1", agent: { id: "a1", name: "PC", lastSeenAt: new Date(now - 30_000), localPrinters: [] } },
        { id: "p2", agent: { id: "a1", name: "PC", lastSeenAt: new Date(now - 120_000), localPrinters: [] } },
        { id: "p3", agent: { id: "a2", name: "PC2", lastSeenAt: null, localPrinters: [] } },
        { id: "p4", agent: null },
      ]);
      const res = mockResponse();

      await listPrinters(mockRequest(), res);

      const out = (res.json as jest.Mock).mock.calls[0][0];
      expect(out.map((p: any) => p.agentOnline)).toEqual([true, false, false, false]);
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe("updatePrinter", () => {
    it("updates via updateMany and returns the printer", async () => {
      db.printer.updateMany.mockResolvedValue({ count: 1 });
      db.printer.findFirst.mockResolvedValue({ id: "p1", name: "Nueva" });
      const res = mockResponse();

      await updatePrinter(mockRequest({ id: "p1" }, { name: "Nueva" }), res);

      expect(db.printer.updateMany).toHaveBeenCalledWith({ where: { id: "p1" }, data: { name: "Nueva" } });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("404 when not found", async () => {
      db.printer.updateMany.mockResolvedValue({ count: 0 });
      const res = mockResponse();

      await updatePrinter(mockRequest({ id: "x" }, { name: "N" }), res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("404 when the new agent is not in the org", async () => {
      db.printAgent.findFirst.mockResolvedValue(null);
      const res = mockResponse();

      await updatePrinter(mockRequest({ id: "p1" }, { agentId: "a-otro" }), res);

      expect(db.printer.updateMany).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe("deletePrinter", () => {
    it("deletes via deleteMany", async () => {
      db.printer.deleteMany.mockResolvedValue({ count: 1 });
      const res = mockResponse();
      await deletePrinter(mockRequest({ id: "p1" }), res);
      expect(db.printer.deleteMany).toHaveBeenCalledWith({ where: { id: "p1" } });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("404 when not found", async () => {
      db.printer.deleteMany.mockResolvedValue({ count: 0 });
      const res = mockResponse();
      await deletePrinter(mockRequest({ id: "x" }), res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe("listAgents", () => {
    it("never exposes hashes and reports online/paired", async () => {
      db.printAgent.findMany.mockResolvedValue([
        { id: "a1", name: "PC", pairingExpiresAt: null, lastSeenAt: new Date(), localPrinters: ["POS-80"] },
        { id: "a2", name: "PC2", pairingExpiresAt: new Date(Date.now() + 60_000), lastSeenAt: null, localPrinters: [] },
      ]);
      const res = mockResponse();

      await listAgents(mockRequest(), res);

      const out = (res.json as jest.Mock).mock.calls[0][0];
      expect(out[0]).toMatchObject({ id: "a1", online: true, paired: true, localPrinters: ["POS-80"] });
      expect(out[1]).toMatchObject({ id: "a2", online: false, paired: false });
      // El select evita traer los hashes desde la base.
      const args = db.printAgent.findMany.mock.calls[0][0];
      expect(args.select.tokenHash).toBeUndefined();
      expect(args.select.pairingCodeHash).toBeUndefined();
    });
  });

  describe("createPairingCode", () => {
    it("returns the plaintext code once, stores only its SHA-256 hash and a 10 min expiry", async () => {
      db.printAgent.create.mockResolvedValue({ id: "a1" });
      const res = mockResponse();
      const before = Date.now();

      await inOrg(() => createPairingCode(mockRequest({}, { name: "PC caja" }), res));

      const data = db.printAgent.create.mock.calls[0][0].data;
      const out = (res.json as jest.Mock).mock.calls[0][0];
      expect(res.status).toHaveBeenCalledWith(201);
      expect(out.agentId).toBe("a1");
      expect(out.code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
      expect(data.organizationId).toBe("org-1");
      expect(data.name).toBe("PC caja");
      expect(data.pairingCodeHash).toBe(
        createHash("sha256").update(out.code.replace("-", "")).digest("hex"),
      );
      expect(JSON.stringify(data)).not.toContain(out.code);
      expect(JSON.stringify(data)).not.toContain(out.code.replace("-", ""));
      const ttl = data.pairingExpiresAt.getTime() - before;
      expect(ttl).toBeGreaterThan(9 * 60_000);
      expect(ttl).toBeLessThanOrEqual(10 * 60_000 + 1000);
      expect(new Date(out.expiresAt).getTime()).toBe(data.pairingExpiresAt.getTime());
    });
  });
});

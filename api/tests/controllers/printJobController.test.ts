import { Request, Response } from "express";
import {
  createPrintJob,
  getPrintJob,
  listActivePrinters,
  MAX_PAYLOAD_BYTES,
  JOB_TTL_MS,
} from "../../src/controllers/printJobController";
import { prisma } from "../../src/config/db";
import { runWithTenant } from "../../src/config/tenantContext";

jest.mock("../../src/config/db", () => ({
  prisma: {
    printer: { findFirst: jest.fn(), findMany: jest.fn() },
    printJob: { create: jest.fn(), findFirst: jest.fn() },
  },
}));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;

const mockRequest = (params: any = {}, body: any = {}) =>
  ({ params, body, user: { id: "u1", role: "VENDEDOR", organizationId: "org-1" } } as unknown as Request);
const mockResponse = () => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};
const inOrg = <T>(fn: () => T): T =>
  runWithTenant({ userId: "u1", role: "VENDEDOR", organizationId: "org-1" }, fn);

const b64 = (bytes: Buffer) => bytes.toString("base64");

describe("createPrintJob", () => {
  beforeEach(() => jest.resetAllMocks());

  it("creates a PENDING job with binary-safe payload, 15 min expiry and creator", async () => {
    const bytes = Buffer.from([0x1b, 0x40, 0x00, 0xff, 0x0a, 0x1d, 0x56, 0x00]);
    db.printer.findFirst.mockResolvedValue({ id: "p1", isActive: true, branchId: "b1" });
    db.printJob.create.mockResolvedValue({ id: "j1", status: "PENDING", expiresAt: new Date() });
    const res = mockResponse();
    const before = Date.now();

    await inOrg(() => createPrintJob(mockRequest({}, { printerId: "p1", payloadBase64: b64(bytes) }), res));

    const data = db.printJob.create.mock.calls[0][0].data;
    expect(Buffer.from(data.payload).equals(bytes)).toBe(true);
    expect(data).toMatchObject({ printerId: "p1", branchId: "b1", organizationId: "org-1", createdById: "u1" });
    const ttl = data.expiresAt.getTime() - before;
    expect(JOB_TTL_MS).toBe(15 * 60 * 1000);
    expect(ttl).toBeGreaterThanOrEqual(JOB_TTL_MS - 1000);
    expect(ttl).toBeLessThanOrEqual(JOB_TTL_MS + 1000);
    expect(res.status).toHaveBeenCalledWith(201);
    expect((res.json as jest.Mock).mock.calls[0][0]).toMatchObject({ id: "j1", status: "PENDING" });
    // La respuesta no devuelve el payload.
    expect(JSON.stringify((res.json as jest.Mock).mock.calls[0][0])).not.toContain("payload");
  });

  it("404 when the printer is not in the caller org (scoped lookup returns null)", async () => {
    db.printer.findFirst.mockResolvedValue(null);
    const res = mockResponse();

    await inOrg(() => createPrintJob(mockRequest({}, { printerId: "p-otra-org", payloadBase64: b64(Buffer.from("x")) }), res));

    expect(db.printer.findFirst).toHaveBeenCalledWith({ where: { id: "p-otra-org" } });
    expect(db.printJob.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("400 when the printer is inactive", async () => {
    db.printer.findFirst.mockResolvedValue({ id: "p1", isActive: false, branchId: null });
    const res = mockResponse();

    await inOrg(() => createPrintJob(mockRequest({}, { printerId: "p1", payloadBase64: b64(Buffer.from("x")) }), res));

    expect(db.printJob.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("413 when the decoded payload exceeds the cap", async () => {
    db.printer.findFirst.mockResolvedValue({ id: "p1", isActive: true, branchId: null });
    const res = mockResponse();
    const big = Buffer.alloc(MAX_PAYLOAD_BYTES + 1, 1);

    await inOrg(() => createPrintJob(mockRequest({}, { printerId: "p1", payloadBase64: b64(big) }), res));

    expect(MAX_PAYLOAD_BYTES).toBe(256 * 1024);
    expect(db.printJob.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(413);
  });

  it("accepts a payload of exactly the cap", async () => {
    db.printer.findFirst.mockResolvedValue({ id: "p1", isActive: true, branchId: null });
    db.printJob.create.mockResolvedValue({ id: "j1", status: "PENDING", expiresAt: new Date() });
    const res = mockResponse();

    await inOrg(() =>
      createPrintJob(mockRequest({}, { printerId: "p1", payloadBase64: b64(Buffer.alloc(MAX_PAYLOAD_BYTES, 1)) }), res),
    );

    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("400 on invalid base64 or an empty payload", async () => {
    const res1 = mockResponse();
    await inOrg(() => createPrintJob(mockRequest({}, { printerId: "p1", payloadBase64: "###no-base64###" }), res1));
    expect(res1.status).toHaveBeenCalledWith(400);

    const res2 = mockResponse();
    await inOrg(() => createPrintJob(mockRequest({}, { printerId: "p1", payloadBase64: "" }), res2));
    expect(res2.status).toHaveBeenCalledWith(400);
    expect(db.printer.findFirst).not.toHaveBeenCalled();
  });
});

describe("getPrintJob", () => {
  beforeEach(() => jest.resetAllMocks());

  it("returns the job status (scoped lookup) without the payload", async () => {
    db.printJob.findFirst.mockResolvedValue({
      id: "j1", status: "PRINTED", errorMessage: null, expiresAt: new Date(Date.now() + 60_000),
    });
    const res = mockResponse();

    await getPrintJob(mockRequest({ id: "j1" }), res);

    const args = db.printJob.findFirst.mock.calls[0][0];
    expect(args.where).toEqual({ id: "j1" });
    expect(args.select.payload).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(200);
    expect((res.json as jest.Mock).mock.calls[0][0]).toMatchObject({ id: "j1", status: "PRINTED" });
  });

  it("404 when the job is not in the org", async () => {
    db.printJob.findFirst.mockResolvedValue(null);
    const res = mockResponse();
    await getPrintJob(mockRequest({ id: "x" }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("reports EXPIRED for a PENDING job past its expiry (not yet swept by the agent poll)", async () => {
    db.printJob.findFirst.mockResolvedValue({
      id: "j1", status: "PENDING", errorMessage: null, expiresAt: new Date(Date.now() - 1000),
    });
    const res = mockResponse();
    await getPrintJob(mockRequest({ id: "j1" }), res);
    expect((res.json as jest.Mock).mock.calls[0][0].status).toBe("EXPIRED");
  });
});

describe("listActivePrinters", () => {
  beforeEach(() => jest.resetAllMocks());

  it("lists only active printers of the org with a safe projection and online flag", async () => {
    db.printer.findMany.mockResolvedValue([
      { id: "p1", name: "Caja", branchId: "b1", agent: { lastSeenAt: new Date() } },
      { id: "p2", name: "Depósito", branchId: null, agent: { lastSeenAt: new Date(Date.now() - 10 * 60_000) } },
      { id: "p3", name: "Sin agente", branchId: "b1", agent: null },
    ]);
    const res = mockResponse();

    await listActivePrinters(mockRequest(), res);

    const args = db.printer.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ isActive: true });
    expect(res.status).toHaveBeenCalledWith(200);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body).toEqual([
      { id: "p1", name: "Caja", branchId: "b1", agentOnline: true },
      { id: "p2", name: "Depósito", branchId: null, agentOnline: false },
      { id: "p3", name: "Sin agente", branchId: "b1", agentOnline: false },
    ]);
  });
});

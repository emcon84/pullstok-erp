import { Request, Response } from "express";
import { createHash } from "crypto";
import {
  pairAgent,
  agentHeartbeat,
  agentPollJobs,
  agentReportResult,
} from "../../src/controllers/printAgentController";
import { prisma } from "../../src/config/db";
import { basePrisma } from "../../src/config/db";

jest.mock("../../src/config/db", () => ({
  prisma: {
    printAgent: { updateMany: jest.fn() },
    printJob: { updateMany: jest.fn(), findMany: jest.fn() },
  },
  basePrisma: { printAgent: { findFirst: jest.fn(), updateMany: jest.fn() } },
}));

const agents = (basePrisma as any).printAgent as Record<string, jest.Mock>;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const mockRequest = (body: any = {}) => ({ body, params: {} } as unknown as Request);
const mockResponse = () => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("pairAgent (sin JWT de usuario)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("looks the code up by hash among non-expired codes and never by plaintext", async () => {
    agents.findFirst.mockResolvedValue(null);
    await pairAgent(mockRequest({ code: "abcde-fghjk" }), mockResponse());

    const where = agents.findFirst.mock.calls[0][0].where;
    expect(where.pairingCodeHash).toBe(sha256("ABCDEFGHJK"));
    expect(where.pairingExpiresAt.gt).toBeInstanceOf(Date);
    expect(JSON.stringify(where)).not.toContain("ABCDEFGHJK");
  });

  it("400 when the code is unknown or expired", async () => {
    agents.findFirst.mockResolvedValue(null);
    const res = mockResponse();
    await pairAgent(mockRequest({ code: "AAAAA-BBBBB" }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(agents.updateMany).not.toHaveBeenCalled();
  });

  it("exchanges the code for agentId + token, stores only the token hash and burns the code", async () => {
    agents.findFirst.mockResolvedValue({ id: "a1", name: "PC caja" });
    agents.updateMany.mockResolvedValue({ count: 1 });
    const res = mockResponse();

    await pairAgent(mockRequest({ code: "ABCDE-FGHJK" }), res);

    const out = (res.json as jest.Mock).mock.calls[0][0];
    expect(res.status).toHaveBeenCalledWith(200);
    expect(out.agentId).toBe("a1");
    expect(out.agentToken.startsWith("a1.")).toBe(true);

    const upd = agents.updateMany.mock.calls[0][0];
    expect(upd.where).toEqual({ id: "a1", pairingCodeHash: sha256("ABCDEFGHJK") });
    expect(upd.data.tokenHash).toBe(sha256(out.agentToken));
    expect(upd.data.pairingCodeHash).toBeNull();
    expect(upd.data.pairingExpiresAt).toBeNull();
    expect(JSON.stringify(upd)).not.toContain(out.agentToken);
  });

  it("is one-time: a concurrent second exchange (count 0) gets 400 and no token", async () => {
    agents.findFirst.mockResolvedValue({ id: "a1", name: "PC caja" });
    agents.updateMany.mockResolvedValue({ count: 0 });
    const res = mockResponse();

    await pairAgent(mockRequest({ code: "ABCDE-FGHJK" }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(JSON.stringify((res.json as jest.Mock).mock.calls[0][0])).not.toContain("agentToken");
  });
});

// ---------- Endpoints autenticados por token de agente ----------
const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const agentReq = (params: any = {}, body: any = {}) =>
  ({ params, body, agent: { id: "a1", organizationId: "org-1", name: "PC" } } as any);

describe("agentHeartbeat", () => {
  beforeEach(() => jest.resetAllMocks());

  it("updates lastSeenAt and local printers of THE authenticated agent only", async () => {
    db.printAgent.updateMany.mockResolvedValue({ count: 1 });
    const res = mockResponse();

    await agentHeartbeat(agentReq({}, { localPrinters: ["POS-80", "PDF"] }), res);

    const arg = db.printAgent.updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "a1" });
    expect(arg.data.lastSeenAt).toBeInstanceOf(Date);
    expect(arg.data.localPrinters).toEqual(["POS-80", "PDF"]);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("does not touch localPrinters when the agent does not report them", async () => {
    db.printAgent.updateMany.mockResolvedValue({ count: 1 });
    await agentHeartbeat(agentReq({}, {}), mockResponse());
    expect("localPrinters" in db.printAgent.updateMany.mock.calls[0][0].data).toBe(false);
  });
});

describe("agentPollJobs", () => {
  beforeEach(() => jest.resetAllMocks());

  it("marks the agent's overdue PENDING jobs as EXPIRED before listing", async () => {
    db.printJob.updateMany.mockResolvedValue({ count: 2 });
    db.printJob.findMany.mockResolvedValue([]);

    await agentPollJobs(agentReq(), mockResponse());

    const upd = db.printJob.updateMany.mock.calls[0][0];
    expect(upd.where).toMatchObject({ status: "PENDING", printer: { agentId: "a1" } });
    expect(upd.where.expiresAt.lte).toBeInstanceOf(Date);
    expect(upd.data.status).toBe("EXPIRED");
    expect(upd.data.completedAt).toBeInstanceOf(Date);
    expect(db.printJob.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      db.printJob.findMany.mock.invocationCallOrder[0],
    );
  });

  it("returns only live PENDING jobs of the agent's active printers, oldest first, max 10, base64", async () => {
    const bytes = Buffer.from([0x1b, 0x40, 0x00, 0xff]);
    db.printJob.updateMany.mockResolvedValue({ count: 0 });
    db.printJob.findMany.mockResolvedValue([
      {
        id: "j1", printerId: "p1", createdAt: new Date(), expiresAt: new Date(),
        payload: bytes, printer: { localName: "POS-80", name: "Caja 1" },
      },
    ]);
    const res = mockResponse();

    await agentPollJobs(agentReq(), res);

    const q = db.printJob.findMany.mock.calls[0][0];
    expect(q.where).toMatchObject({ status: "PENDING", printer: { agentId: "a1", isActive: true } });
    expect(q.where.expiresAt.gt).toBeInstanceOf(Date);
    expect(q.orderBy).toEqual({ createdAt: "asc" });
    expect(q.take).toBe(10);
    const out = (res.json as jest.Mock).mock.calls[0][0];
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "j1", printerId: "p1", localName: "POS-80" });
    expect(Buffer.from(out[0].payloadBase64, "base64").equals(bytes)).toBe(true);
  });
});

describe("agentReportResult", () => {
  beforeEach(() => jest.resetAllMocks());

  it("marks PRINTED only a PENDING job of the agent's own printers", async () => {
    db.printJob.updateMany.mockResolvedValue({ count: 1 });
    const res = mockResponse();

    await agentReportResult(agentReq({ id: "j1" }, { status: "PRINTED" }), res);

    const upd = db.printJob.updateMany.mock.calls[0][0];
    expect(upd.where).toEqual({ id: "j1", status: "PENDING", printer: { agentId: "a1" } });
    expect(upd.data).toMatchObject({ status: "PRINTED" });
    expect(upd.data.completedAt).toBeInstanceOf(Date);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("stores the error message on ERROR", async () => {
    db.printJob.updateMany.mockResolvedValue({ count: 1 });
    await agentReportResult(agentReq({ id: "j1" }, { status: "ERROR", errorMessage: "Sin papel" }), mockResponse());
    expect(db.printJob.updateMany.mock.calls[0][0].data).toMatchObject({ status: "ERROR", errorMessage: "Sin papel" });
  });

  it("404 for a job of another agent/org (count 0)", async () => {
    db.printJob.updateMany.mockResolvedValue({ count: 0 });
    const res = mockResponse();
    await agentReportResult(agentReq({ id: "j-ajeno" }, { status: "PRINTED" }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

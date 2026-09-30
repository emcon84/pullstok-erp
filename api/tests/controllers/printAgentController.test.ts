import { Request, Response } from "express";
import { createHash } from "crypto";
import { pairAgent } from "../../src/controllers/printAgentController";
import { basePrisma } from "../../src/config/db";

jest.mock("../../src/config/db", () => ({
  prisma: { printAgent: {}, printJob: {}, printer: {} },
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

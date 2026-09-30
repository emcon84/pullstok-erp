import { authenticateAgent } from "../../src/middlewares/agentAuth";
import { basePrisma } from "../../src/config/db";
import { getTenantContext } from "../../src/config/tenantContext";
import {
  generateAgentToken,
  hashAgentToken,
} from "../../src/services/printAgentTokens";

jest.mock("../../src/config/db", () => ({
  prisma: {},
  basePrisma: { printAgent: { findFirst: jest.fn() } },
}));

const findAgent = (basePrisma as any).printAgent.findFirst as jest.Mock;

const mockResponse = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const reqWith = (authorization?: string, query: any = {}) =>
  ({ header: (n: string) => (n.toLowerCase() === "authorization" ? authorization : undefined), query } as any);

describe("authenticateAgent", () => {
  beforeEach(() => jest.resetAllMocks());

  it("401 without Authorization header", async () => {
    const res = mockResponse();
    const next = jest.fn();
    await authenticateAgent(reqWith(undefined), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("ignores a token passed in the query string", async () => {
    const token = generateAgentToken("a1");
    const res = mockResponse();
    const next = jest.fn();
    await authenticateAgent(reqWith(undefined, { token, agentToken: token }), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(findAgent).not.toHaveBeenCalled();
  });

  it("401 on a malformed token without hitting the database", async () => {
    const res = mockResponse();
    await authenticateAgent(reqWith("Bearer sinpunto"), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
    expect(findAgent).not.toHaveBeenCalled();
  });

  it("401 when the agent does not exist", async () => {
    findAgent.mockResolvedValue(null);
    const res = mockResponse();
    await authenticateAgent(reqWith(`Bearer ${generateAgentToken("a1")}`), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("401 when the agent is not paired yet (no token hash)", async () => {
    findAgent.mockResolvedValue({ id: "a1", organizationId: "org-1", tokenHash: null });
    const res = mockResponse();
    await authenticateAgent(reqWith(`Bearer ${generateAgentToken("a1")}`), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("401 with the wrong secret (same agent id)", async () => {
    findAgent.mockResolvedValue({
      id: "a1",
      organizationId: "org-1",
      tokenHash: hashAgentToken(generateAgentToken("a1")),
    });
    const res = mockResponse();
    const next = jest.fn();
    await authenticateAgent(reqWith(`Bearer ${generateAgentToken("a1")}`), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("does not accept a user JWT-looking token", async () => {
    const res = mockResponse();
    await authenticateAgent(reqWith("Bearer eyJhbGciOiJIUzI1NiJ9.eyJpZCI6IjEifQ.firma"), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("valid token: sets req.agent and runs next inside the agent's tenant context", async () => {
    const token = generateAgentToken("a1");
    findAgent.mockResolvedValue({
      id: "a1",
      name: "PC caja",
      organizationId: "org-1",
      tokenHash: hashAgentToken(token),
    });
    const req = reqWith(`Bearer ${token}`);
    let seenOrg: string | null | undefined;
    const next = jest.fn(() => {
      seenOrg = getTenantContext()?.organizationId;
    });

    await authenticateAgent(req, mockResponse(), next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.agent).toEqual({ id: "a1", organizationId: "org-1", name: "PC caja" });
    expect(seenOrg).toBe("org-1");
  });

  it("cross-org: a token of agent A cannot authenticate as agent B", async () => {
    const tokenA = generateAgentToken("a1");
    // Quien presenta el token de A pero con el id de B → se busca B, su hash no coincide.
    const forged = `a2.${tokenA.split(".")[1]}`;
    findAgent.mockResolvedValue({
      id: "a2",
      organizationId: "org-2",
      tokenHash: hashAgentToken(generateAgentToken("a2")),
    });
    const res = mockResponse();
    const next = jest.fn();
    await authenticateAgent(reqWith(`Bearer ${forged}`), res, next);
    expect(findAgent).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "a2" } }));
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

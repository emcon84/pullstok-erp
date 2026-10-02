import { requireBalancesToken } from "../../src/middlewares/requireBalancesToken";
import balancesLock from "../../src/services/balancesLockService";

jest.mock("../../src/services/balancesLockService", () => ({
  __esModule: true,
  default: { assertToken: jest.fn() },
}));

const assertToken = (balancesLock as unknown as { assertToken: jest.Mock }).assertToken;

const mockRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};
const mockReq = (headers: Record<string, string> = {}) =>
  ({
    header: (n: string) => headers[n],
    user: { id: "u-1", role: "ADMIN", organizationId: "org-1" },
  }) as any;

describe("requireBalancesToken", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calls next when the token validates for the authenticated user and org", () => {
    assertToken.mockReturnValue(undefined);
    const next = jest.fn();
    requireBalancesToken(mockReq({ "X-Balances-Token": "tok" }), mockRes(), next);
    expect(assertToken).toHaveBeenCalledWith("tok", { userId: "u-1", organizationId: "org-1" });
    expect(next).toHaveBeenCalled();
  });

  it("answers 403 BALANCES_LOCKED when the token is invalid", () => {
    assertToken.mockImplementation(() => {
      throw Object.assign(new Error("locked"), { code: "BALANCES_LOCKED" });
    });
    const res = mockRes();
    const next = jest.fn();
    requireBalancesToken(mockReq(), res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "BALANCES_LOCKED" }));
    expect(next).not.toHaveBeenCalled();
  });
});

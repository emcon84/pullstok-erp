import jwt from "jsonwebtoken";
import balancesLock, { __resetBalancesLockForTests } from "../../src/services/balancesLockService";
import { generateAccessToken } from "../../src/utils/jwtUtils";

const USER = { userId: "u-1", organizationId: "org-1" };

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e: any) {
    return e.code;
  }
  return undefined;
};

const failN = (n: number, user = USER) => {
  for (let i = 0; i < n; i++) codeOf(() => balancesLock.unlock(user, "bad"));
};

describe("balancesLockService", () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    process.env = { ...OLD_ENV, JWT_SECRET: "test-secret", BALANCES_VIEW_PASSWORD: "s3cret-pw" };
    __resetBalancesLockForTests();
    jest.useRealTimers();
  });
  afterAll(() => {
    process.env = OLD_ENV;
  });

  it("fails closed when BALANCES_VIEW_PASSWORD is unset or empty", () => {
    delete process.env.BALANCES_VIEW_PASSWORD;
    expect(codeOf(() => balancesLock.unlock(USER, "anything"))).toBe("BALANCES_LOCK_NOT_CONFIGURED");
    process.env.BALANCES_VIEW_PASSWORD = "";
    expect(codeOf(() => balancesLock.unlock(USER, ""))).toBe("BALANCES_LOCK_NOT_CONFIGURED");
  });

  it("rejects a wrong password (including a different length)", () => {
    expect(codeOf(() => balancesLock.unlock(USER, "nope"))).toBe("INVALID_BALANCES_PASSWORD");
    expect(codeOf(() => balancesLock.unlock(USER, "s3cret-pw-longer"))).toBe("INVALID_BALANCES_PASSWORD");
  });

  it("returns a 15 minute token valid for the same user and org", () => {
    const { token, expiresInSec } = balancesLock.unlock(USER, "s3cret-pw");
    expect(expiresInSec).toBe(900);
    expect(() => balancesLock.assertToken(token, USER)).not.toThrow();
  });

  it("rejects a token of another user or org, garbage, or missing", () => {
    const { token } = balancesLock.unlock(USER, "s3cret-pw");
    expect(codeOf(() => balancesLock.assertToken(token, { ...USER, userId: "u-2" }))).toBe("BALANCES_LOCKED");
    expect(codeOf(() => balancesLock.assertToken(token, { ...USER, organizationId: "org-2" }))).toBe("BALANCES_LOCKED");
    expect(codeOf(() => balancesLock.assertToken("garbage", USER))).toBe("BALANCES_LOCKED");
    expect(codeOf(() => balancesLock.assertToken(undefined, USER))).toBe("BALANCES_LOCKED");
  });

  it("rejects an expired token", () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-10-02T12:00:00Z"));
    const { token } = balancesLock.unlock(USER, "s3cret-pw");
    jest.setSystemTime(new Date("2026-10-02T12:15:01Z"));
    expect(codeOf(() => balancesLock.assertToken(token, USER))).toBe("BALANCES_LOCKED");
  });

  it("rejects a normal session JWT used as balances token", () => {
    const session = generateAccessToken({ id: "u-1", role: "ADMIN", organizationId: "org-1" });
    expect(codeOf(() => balancesLock.assertToken(session, USER))).toBe("BALANCES_LOCKED");
  });

  it("a balances token cannot verify as a session token and carries the purpose claim", () => {
    const { token } = balancesLock.unlock(USER, "s3cret-pw");
    expect(() => jwt.verify(token, "test-secret")).toThrow();
    expect((jwt.decode(token) as any).purpose).toBe("balances-view");
  });

  it("rate-limits after 5 failures per user (even with the right password); others unaffected", () => {
    failN(5);
    expect(codeOf(() => balancesLock.unlock(USER, "s3cret-pw"))).toBe("BALANCES_RATE_LIMITED");
    expect(() => balancesLock.unlock({ userId: "u-9", organizationId: "org-1" }, "s3cret-pw")).not.toThrow();
  });

  it("releases the limiter after the 15 minute window", () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-10-02T12:00:00Z"));
    failN(5);
    jest.setSystemTime(new Date("2026-10-02T12:15:01Z"));
    expect(() => balancesLock.unlock(USER, "s3cret-pw")).not.toThrow();
  });

  it("a successful unlock resets the failure counter", () => {
    failN(4);
    balancesLock.unlock(USER, "s3cret-pw");
    failN(4);
    expect(codeOf(() => balancesLock.unlock(USER, "bad"))).toBe("INVALID_BALANCES_PASSWORD");
  });
});

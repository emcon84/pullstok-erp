/**
 * Unit tests — cashSessionService (sdd/caja-apertura-cierre).
 * Mocks prisma (TENANT models). Covers R1 (open), R2 (single OPEN per
 * branch/cashier), R3 (close/arqueo), R4 (current/one/list), R5 (permisos
 * dueño vs gestión), R10 (solo EFECTIVO suma al arqueo).
 */
import cashSessionService from "../../src/services/cashSessionService";
import { prisma, basePrisma } from "../../src/config/db";

jest.mock("../../src/config/db", () => ({
  prisma: {
    cashSession: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    salePayment: {
      groupBy: jest.fn(),
    },
    $transaction: jest.fn(),
  },
  basePrisma: {
    branchAssignment: { findMany: jest.fn() },
  },
}));

jest.mock("../../src/config/tenantContext", () => ({
  requireOrganizationId: jest.fn().mockReturnValue("org-1"),
}));

const mockedPrisma = prisma as unknown as {
  cashSession: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    updateMany: jest.Mock;
  };
  salePayment: { groupBy: jest.Mock };
  $transaction: jest.Mock;
};

const mockedBase = basePrisma as unknown as {
  branchAssignment: { findMany: jest.Mock };
};

const openSession = {
  id: "cs-1",
  branchId: "b-1",
  cashierId: "u-1",
  organizationId: "org-1",
  openedAt: new Date("2026-08-20T10:00:00Z"),
  closedAt: null,
  openingAmount: 5000,
  expectedAmount: null,
  closingAmount: null,
  closingByMethod: null,
  status: "OPEN",
  observations: null,
  createdAt: new Date("2026-08-20T10:00:00Z"),
  updatedAt: new Date("2026-08-20T10:00:00Z"),
};

describe("cashSessionService.openCash", () => {
  beforeEach(() => jest.clearAllMocks());

  it("R1: CASHIER opens cash on their assigned branch, creating an OPEN session", async () => {
    mockedBase.branchAssignment.findMany.mockResolvedValue([{ branchId: "b-1" }]);
    mockedPrisma.cashSession.findFirst.mockResolvedValue(null); // no OPEN existing
    mockedPrisma.cashSession.create.mockResolvedValue({ ...openSession });

    const result = await cashSessionService.openCash(
      { openingAmount: 5000, observations: "Fondo inicial" },
      "u-1",
      "CASHIER",
    );

    expect(mockedPrisma.cashSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          branchId: "b-1",
          cashierId: "u-1",
          openingAmount: 5000,
          observations: "Fondo inicial",
          status: "OPEN",
        }),
      }),
    );
    expect(result.status).toBe("OPEN");
    expect(result.cashierId).toBe("u-1");
  });

  it("R2: rejects a second open when an OPEN session already exists for (branch, cashier)", async () => {
    mockedBase.branchAssignment.findMany.mockResolvedValue([{ branchId: "b-1" }]);
    mockedPrisma.cashSession.findFirst.mockResolvedValue({ ...openSession, id: "cs-existing" });

    const err: any = await cashSessionService
      .openCash({ openingAmount: 5000 }, "u-1", "CASHIER")
      .catch((e: any) => e);

    expect(err.code).toBe("CASH_SESSION_ALREADY_OPEN");
    expect(mockedPrisma.cashSession.create).not.toHaveBeenCalled();
  });

  it("R2: allows opening again after the previous session was CLOSED", async () => {
    mockedBase.branchAssignment.findMany.mockResolvedValue([{ branchId: "b-1" }]);
    // findFirst for OPEN returns null (previous is CLOSED)
    mockedPrisma.cashSession.findFirst.mockResolvedValue(null);
    mockedPrisma.cashSession.create.mockResolvedValue({ ...openSession, id: "cs-2" });

    const result = await cashSessionService.openCash({}, "u-1", "CASHIER");

    expect(mockedPrisma.cashSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          branchId: "b-1",
          cashierId: "u-1",
          status: "OPEN",
        }),
      }),
    );
    expect(mockedPrisma.cashSession.create).toHaveBeenCalledTimes(1);
    expect(result.id).toBe("cs-2");
  });

  it("ADMIN opens on an explicit branch from the body", async () => {
    mockedPrisma.cashSession.findFirst.mockResolvedValue(null);
    mockedPrisma.cashSession.create.mockResolvedValue({ ...openSession, branchId: "b-admin" });

    const result = await cashSessionService.openCash(
      { branchId: "b-admin", openingAmount: 1000 },
      "u-admin",
      "ADMIN",
    );

    expect(mockedBase.branchAssignment.findMany).not.toHaveBeenCalled();
    expect(mockedPrisma.cashSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ branchId: "b-admin" }),
      }),
    );
    expect(result.branchId).toBe("b-admin");
  });

  it("ADMIN without explicit branch → INVALID_BRANCH", async () => {
    const err: any = await cashSessionService
      .openCash({}, "u-admin", "ADMIN")
      .catch((e: any) => e);

    expect(err.code).toBe("INVALID_BRANCH");
  });

  it("CASHIER with multiple assigned branches → INVALID_BRANCH (must select one)", async () => {
    mockedBase.branchAssignment.findMany.mockResolvedValue([
      { branchId: "b-1" },
      { branchId: "b-2" },
    ]);
    const err: any = await cashSessionService
      .openCash({}, "u-1", "CASHIER")
      .catch((e: any) => e);

    expect(err.code).toBe("INVALID_BRANCH");
  });

  it("CASHIER with no assigned branch → INVALID_BRANCH", async () => {
    mockedBase.branchAssignment.findMany.mockResolvedValue([]);
    const err: any = await cashSessionService
      .openCash({}, "u-1", "CASHIER")
      .catch((e: any) => e);

    expect(err.code).toBe("INVALID_BRANCH");
  });
});

describe("cashSessionService.closeCash", () => {
  beforeEach(() => jest.clearAllMocks());

  it("R3: computes expectedAmount = opening + Σ EFECTIVO and returns difference", async () => {
    mockedPrisma.cashSession.findFirst.mockResolvedValue({
      ...openSession,
      openingAmount: 5000,
      status: "OPEN",
    });
    // SalePayments of the session: EFECTIVO 1500 + TARJETA_CREDITO 800
    mockedPrisma.salePayment.groupBy.mockResolvedValue([
      { method: "EFECTIVO", _sum: { amount: 1500 } },
      { method: "TARJETA_CREDITO", _sum: { amount: 800 } },
    ]);
    mockedPrisma.$transaction.mockImplementation((cb: any) =>
      cb(mockedPrisma),
    );
    mockedPrisma.cashSession.updateMany.mockResolvedValue({ count: 1 });

    const result = await cashSessionService.closeCash(
      "cs-1",
      { closingByMethod: { EFECTIVO: 6400 }, closingAmount: 6400 },
      "u-1",
      "CASHIER",
    );

    // expectedAmount = opening 5000 + EFECTIVO 1500 (only cash counts, R10)
    expect(result.expectedAmount).toBe(6500);
    expect(result.closingAmount).toBe(6400);
    expect(result.difference).toBe(-100); // 6400 - 6500

    // updateMany in transaction sets CLOSED + arqueo
    expect(mockedPrisma.cashSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "cs-1", status: "OPEN" }),
        data: expect.objectContaining({
          expectedAmount: 6500,
          closingAmount: 6400,
          closingByMethod: { EFECTIVO: 6400 },
          status: "CLOSED",
        }),
      }),
    );
  });

  it("R3: close by MANAGEMENT (not owner) is allowed (gestión scope)", async () => {
    mockedPrisma.cashSession.findFirst.mockResolvedValue({
      ...openSession,
      cashierId: "u-other",
      status: "OPEN",
    });
    mockedPrisma.salePayment.groupBy.mockResolvedValue([
      { method: "EFECTIVO", _sum: { amount: 0 } },
    ]);
    mockedPrisma.$transaction.mockImplementation((cb: any) => cb(mockedPrisma));
    mockedPrisma.cashSession.updateMany.mockResolvedValue({ count: 1 });

    const result = await cashSessionService.closeCash(
      "cs-1",
      { closingByMethod: { EFECTIVO: 5000 } },
      "u-mgmt",
      "MANAGEMENT",
    );

    expect(result.expectedAmount).toBe(5000);
    expect(mockedPrisma.cashSession.updateMany).toHaveBeenCalledTimes(1);
  });

  it("R3: throws CASH_SESSION_NOT_FOUND when session does not exist", async () => {
    mockedPrisma.cashSession.findFirst.mockResolvedValue(null);

    const err: any = await cashSessionService
      .closeCash("cs-x", { closingByMethod: { EFECTIVO: 100 } }, "u-1", "CASHIER")
      .catch((e: any) => e);

    expect(err.code).toBe("CASH_SESSION_NOT_FOUND");
  });

  it("R3: throws CASH_SESSION_ALREADY_CLOSED when session is already CLOSED", async () => {
    mockedPrisma.cashSession.findFirst.mockResolvedValue({
      ...openSession,
      status: "CLOSED",
    });

    const err: any = await cashSessionService
      .closeCash("cs-1", { closingByMethod: { EFECTIVO: 100 } }, "u-1", "CASHIER")
      .catch((e: any) => e);

    expect(err.code).toBe("CASH_SESSION_ALREADY_CLOSED");
  });

  it("R5: a CASHIER cannot close another cashier's session (FORBIDDEN)", async () => {
    mockedPrisma.cashSession.findFirst.mockResolvedValue({
      ...openSession,
      cashierId: "u-other",
      status: "OPEN",
    });

    const err: any = await cashSessionService
      .closeCash("cs-1", { closingByMethod: { EFECTIVO: 100 } }, "u-1", "CASHIER")
      .catch((e: any) => e);

    expect(err.code).toBe("FORBIDDEN");
    expect(mockedPrisma.cashSession.updateMany).not.toHaveBeenCalled();
  });
});

describe("cashSessionService.getCurrent / getOne / list", () => {
  beforeEach(() => jest.clearAllMocks());

  it("R4: getCurrent returns the OPEN session for the cashier", async () => {
    mockedPrisma.cashSession.findFirst.mockResolvedValue({ ...openSession });

    const result = await cashSessionService.getCurrent("u-1", "CASHIER");

    expect(mockedPrisma.cashSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ cashierId: "u-1", status: "OPEN" }),
      }),
    );
    expect(result!.id).toBe("cs-1");
  });

  it("R4: getCurrent with branchId for admin returns that branch's open session", async () => {
    mockedPrisma.cashSession.findFirst.mockResolvedValue({ ...openSession, branchId: "b-9" });

    const result = await cashSessionService.getCurrent("u-admin", "ADMIN", "b-9");

    expect(mockedPrisma.cashSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ branchId: "b-9", status: "OPEN" }),
      }),
    );
    expect(result!.branchId).toBe("b-9");
  });

  it("R4: getOne returns the session for the owner cashier", async () => {
    mockedPrisma.cashSession.findFirst.mockResolvedValue({ ...openSession });

    const result = await cashSessionService.getOne("cs-1", "u-1", "CASHIER");

    expect(mockedPrisma.cashSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "cs-1", cashierId: "u-1" }),
      }),
    );
    expect(result).toBeDefined();
  });

  it("R5: getOne for a cashier requesting another's session is scoped out (NOT_FOUND)", async () => {
    // Operative scope por cashierId → la query filtra y no matchea la sesión ajena.
    mockedPrisma.cashSession.findFirst.mockResolvedValue(null);

    const err: any = await cashSessionService
      .getOne("cs-1", "u-1", "CASHIER")
      .catch((e: any) => e);

    expect(mockedPrisma.cashSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "cs-1", cashierId: "u-1" }),
      }),
    );
    expect(err.code).toBe("CASH_SESSION_NOT_FOUND");
  });

  it("R4: getOne throws CASH_SESSION_NOT_FOUND when not found", async () => {
    mockedPrisma.cashSession.findFirst.mockResolvedValue(null);

    const err: any = await cashSessionService
      .getOne("cs-x", "u-admin", "ADMIN")
      .catch((e: any) => e);

    expect(err.code).toBe("CASH_SESSION_NOT_FOUND");
  });

  it("R5: list scopes cashier to their own sessions only", async () => {
    mockedPrisma.cashSession.findMany.mockResolvedValue([{ ...openSession }]);

    const result = await cashSessionService.list({}, "u-1", "CASHIER");

    expect(mockedPrisma.cashSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ cashierId: "u-1" }),
      }),
    );
    expect(result).toHaveLength(1);
  });

  it("R5: list for ADMIN returns all org sessions (no cashierId filter)", async () => {
    mockedPrisma.cashSession.findMany.mockResolvedValue([
      { ...openSession },
      { ...openSession, id: "cs-2" },
    ]);

    const result = await cashSessionService.list({}, "u-admin", "ADMIN");

    const callArgs = mockedPrisma.cashSession.findMany.mock.calls[0][0];
    expect(callArgs.where.cashierId).toBeUndefined();
    expect(result).toHaveLength(2);
  });
});

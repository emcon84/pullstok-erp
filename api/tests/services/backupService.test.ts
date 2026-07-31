/**
 * Unit tests for backupService.ts — backupOrganization.
 * Mocks child_process, basePrisma, zlib, and uploadBackupToR2.
 */

// Mocks must use inline jest.fn() — Jest hoists jest.mock, so factory closures
// cannot reference outer-scope let/const variables.

const mockExecSync = jest.fn();
const mockQueryRawUnsafe = jest.fn();
const mockUploadBackupToR2 = jest.fn();
const mockGzipWrite = jest.fn();
const mockGzipEnd = jest.fn();
const mockGzipOn = jest.fn();

jest.mock("child_process", () => ({
  execSync: mockExecSync,
}));

jest.mock("../../src/config/db", () => ({
  basePrisma: {
    $queryRawUnsafe: mockQueryRawUnsafe,
  },
  prisma: {},
}));

jest.mock("../../src/config/storage", () => ({
  uploadBackupToR2: mockUploadBackupToR2,
  uploadToR2: jest.fn(),
  uploadImageToR2: jest.fn(),
  generatePresignedUrl: jest.fn(),
}));

jest.mock("zlib", () => ({
  createGzip: jest.fn(() => ({
    write: mockGzipWrite,
    end: mockGzipEnd,
    on: mockGzipOn,
  })),
}));

import { backupOrganization } from "../../src/services/backupService";

describe("backupService", () => {
  const orgId = "org-abc-123";
  const slug = "mi-ferreteria";
  const date = "2026-07-31";
  const expectedKey = `backups/${slug}/${date}.sql.gz`;

  const sampleDdl =
    "-- PostgreSQL database dump\nCREATE TABLE public.organizations (...);";

  beforeEach(() => {
    jest.clearAllMocks();

    process.env.DATABASE_URL =
      "postgresql://user:pass@localhost:5432/pullstok_dev?schema=public";

    mockQueryRawUnsafe.mockResolvedValue(undefined);
    mockExecSync.mockReturnValue(sampleDdl);
    mockUploadBackupToR2.mockResolvedValue(undefined);

    mockGzipOn.mockImplementation((event: string, cb: () => void) => {
      if (event === "end") {
        setImmediate(cb);
      }
    });
    mockGzipWrite.mockReturnValue(true);
    mockGzipEnd.mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.DATABASE_URL;
  });

  // --- Helper: make table queries return empty ---

  function resolveEmptySelects() {
    mockQueryRawUnsafe.mockImplementation((sql: string) => {
      if (typeof sql === "string" && sql.trim().toUpperCase().startsWith("SELECT"))
        return Promise.resolve([]);
      return Promise.resolve(undefined);
    });
  }

  // --- Happy path ---

  it("opens BEGIN READ ONLY transaction", async () => {
    resolveEmptySelects();

    await backupOrganization(orgId, slug, date);

    const beginCalls = mockQueryRawUnsafe.mock.calls.filter(
      (call: any[]) => call[0] === "BEGIN READ ONLY",
    );
    expect(beginCalls.length).toBe(1);
  });

  it("calls pg_dump --schema-only for DDL", async () => {
    resolveEmptySelects();

    await backupOrganization(orgId, slug, date);

    expect(mockExecSync).toHaveBeenCalledTimes(1);
    const pgDumpCall = mockExecSync.mock.calls[0][0] as string;
    expect(pgDumpCall).toContain("pg_dump");
    expect(pgDumpCall).toContain("--schema-only");
    expect(pgDumpCall).toContain("--no-owner");
    expect(pgDumpCall).toContain("pullstok_dev");
  });

  it("writes DDL to the gzip stream", async () => {
    resolveEmptySelects();

    await backupOrganization(orgId, slug, date);

    const writtenStrings = mockGzipWrite.mock.calls
      .filter((call: any[]) => Buffer.isBuffer(call[0]))
      .map((call: any[]) => call[0].toString());

    expect(writtenStrings.join("")).toContain("-- DDL (pg_dump --schema-only)");
    expect(writtenStrings.join("")).toContain(sampleDdl);
    expect(writtenStrings.join("")).toContain("BEGIN;");
    expect(writtenStrings.join("")).toContain("COMMIT;");
  });

  it("uploads to R2 with correct key path", async () => {
    resolveEmptySelects();

    const result = await backupOrganization(orgId, slug, date);

    expect(mockUploadBackupToR2).toHaveBeenCalledTimes(1);
    expect(mockUploadBackupToR2).toHaveBeenCalledWith(
      expectedKey,
      expect.any(Buffer),
      "application/gzip",
    );
    expect(result.key).toBe(expectedKey);
    expect(result.bytes).toBeGreaterThanOrEqual(0);
  });

  it("commits transaction after successful upload", async () => {
    resolveEmptySelects();

    await backupOrganization(orgId, slug, date);

    const commitCalls = mockQueryRawUnsafe.mock.calls.filter(
      (call: any[]) => call[0] === "COMMIT",
    );
    expect(commitCalls.length).toBe(1);
  });

  // --- Table query verification ---

  it("queries tenant tables with organizationId filter", async () => {
    const selectCalls: string[] = [];
    mockQueryRawUnsafe.mockImplementation((sql: string, ..._args: any[]) => {
      if (typeof sql === "string" && sql.trim().toUpperCase().startsWith("SELECT")) {
        selectCalls.push(sql);
        return Promise.resolve([]);
      }
      return Promise.resolve(undefined);
    });

    await backupOrganization(orgId, slug, date);

    const orgQuery = selectCalls.find((s) => s.includes("organizations"));
    expect(orgQuery).toBeDefined();
    // Organization table queries by "id" (not "organizationId") — it IS the org
    expect(orgQuery).toContain("\"id\"");
    expect(selectCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("queries OrderItem via JOIN on Order.orgId", async () => {
    const selectCalls: string[] = [];
    mockQueryRawUnsafe.mockImplementation((sql: string, ..._args: any[]) => {
      if (typeof sql === "string" && sql.trim().toUpperCase().startsWith("SELECT")) {
        selectCalls.push(sql);
        return Promise.resolve([]);
      }
      return Promise.resolve(undefined);
    });

    await backupOrganization(orgId, slug, date);

    const oiQuery = selectCalls.find((s) => s.includes("order_items"));
    expect(oiQuery).toBeDefined();
    expect(oiQuery).toContain("INNER JOIN orders");
    expect(oiQuery).toContain('"orderId"');
  });

  it("queries Message via JOIN on Conversation.orgId", async () => {
    const selectCalls: string[] = [];
    mockQueryRawUnsafe.mockImplementation((sql: string, ..._args: any[]) => {
      if (typeof sql === "string" && sql.trim().toUpperCase().startsWith("SELECT")) {
        selectCalls.push(sql);
        return Promise.resolve([]);
      }
      return Promise.resolve(undefined);
    });

    await backupOrganization(orgId, slug, date);

    const msgQuery = selectCalls.find((s) => s.includes("messages"));
    expect(msgQuery).toBeDefined();
    expect(msgQuery).toContain("INNER JOIN conversations");
    expect(msgQuery).toContain('"conversationId"');
  });

  // --- Error handling ---

  it("rolls back transaction on error and propagates error", async () => {
    resolveEmptySelects();
    mockExecSync.mockImplementation(() => {
      throw new Error("pg_dump not found");
    });

    await expect(backupOrganization(orgId, slug, date)).rejects.toThrow(
      "pg_dump not found",
    );

    const rollbackCalls = mockQueryRawUnsafe.mock.calls.filter(
      (call: any[]) => call[0] === "ROLLBACK",
    );
    expect(rollbackCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("throws if DATABASE_URL is not set", async () => {
    delete process.env.DATABASE_URL;
    resolveEmptySelects();

    await expect(backupOrganization(orgId, slug, date)).rejects.toThrow(
      "DATABASE_URL environment variable is not set",
    );
  });
});

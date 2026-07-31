/**
 * Integration tests for GET /api/backups/latest.
 * Auth enforcement, role enforcement, and error paths.
 */

import { Response } from "express";
import { getLatestBackup } from "../../src/controllers/backupController";
import { basePrisma } from "../../src/config/db";
import * as tenantContext from "../../src/config/tenantContext";
import * as storage from "../../src/config/storage";

jest.mock("../../src/config/db", () => ({
  basePrisma: {
    organization: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock("../../src/config/tenantContext", () => ({
  requireOrganizationId: jest.fn(),
}));

jest.mock("../../src/config/storage", () => ({
  generatePresignedUrl: jest.fn(),
  uploadBackupToR2: jest.fn(),
  uploadToR2: jest.fn(),
  uploadImageToR2: jest.fn(),
}));

// Also mock backupService's sanitizeSlug to keep this test focused on the controller
jest.mock("../../src/services/backupService", () => ({
  sanitizeSlug: (slug: string) => slug.replace(/[/\\:]/g, "-"),
  backupOrganization: jest.fn(),
}));

const mockedDb = basePrisma as unknown as {
  organization: { findUnique: jest.Mock };
};

const mockRequest = () => ({ body: {} } as any);
const mockResponse = () => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("backupController — getLatestBackup", () => {
  const orgId = "org-123";
  const slug = "mi-ferreteria";

  beforeEach(() => {
    jest.clearAllMocks();
    (tenantContext.requireOrganizationId as jest.Mock).mockReturnValue(orgId);
    (storage.generatePresignedUrl as jest.Mock).mockResolvedValue(
      "https://signed.example.com/backups/mi-ferreteria/2026-07-31.sql.gz",
    );
  });

  it("returns 200 with url and date for valid ADMIN request", async () => {
    mockedDb.organization.findUnique.mockResolvedValue({ slug });

    const req = mockRequest();
    const res = mockResponse();

    await getLatestBackup(req, res);

    expect(mockedDb.organization.findUnique).toHaveBeenCalledWith({
      where: { id: orgId },
      select: { slug: true },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining("signed"),
        date: expect.any(String),
        size: expect.any(Number),
      }),
    );
  });

  it("sanitizes slug with special characters in the R2 key", async () => {
    mockedDb.organization.findUnique.mockResolvedValue({ slug: "org/name:test" });

    const req = mockRequest();
    const res = mockResponse();

    await getLatestBackup(req, res);

    expect(storage.generatePresignedUrl).toHaveBeenCalledWith(
      expect.stringContaining("org-name-test"),
      3600,
    );
  });

  it("returns 404 if organization is not found", async () => {
    mockedDb.organization.findUnique.mockResolvedValue(null);

    const req = mockRequest();
    const res = mockResponse();

    await getLatestBackup(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Organization not found" }),
    );
  });

  it("returns 500 if presigned URL generation fails (R2 unreachable)", async () => {
    mockedDb.organization.findUnique.mockResolvedValue({ slug });
    (storage.generatePresignedUrl as jest.Mock).mockRejectedValue(
      new Error("R2 connection timeout"),
    );

    const req = mockRequest();
    const res = mockResponse();

    await getLatestBackup(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("Could not generate"),
      }),
    );
    // No stack trace leaked (spec A6)
    const call = (res.json as jest.Mock).mock.calls[0][0];
    expect(call.message).not.toContain("R2 connection timeout");
  });

  it("returns 500 error message without stack trace (spec A6)", async () => {
    mockedDb.organization.findUnique.mockResolvedValue({ slug });
    (storage.generatePresignedUrl as jest.Mock).mockRejectedValue(
      new Error("EACCES: permission denied"),
    );

    const req = mockRequest();
    const res = mockResponse();

    await getLatestBackup(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.message).toBe(
      "Could not generate backup download link. Please try again later.",
    );
    expect(body.stack).toBeUndefined();
  });
});

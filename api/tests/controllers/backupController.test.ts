/**
 * Integration tests for GET /api/backups/latest.
 * Auth enforcement, role enforcement, and error paths.
 * Updated: controller now streams file directly (no presigned URL).
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
  downloadFromR2: jest.fn(),
  uploadBackupToR2: jest.fn(),
  uploadToR2: jest.fn(),
  uploadImageToR2: jest.fn(),
  generatePresignedUrl: jest.fn(),
}));

jest.mock("../../src/services/backupService", () => ({
  sanitizeSlug: (slug: string) => slug.replace(/[/\\:]/g, "-"),
  backupOrganization: jest.fn(),
}));

const mockedDb = basePrisma as unknown as {
  organization: { findUnique: jest.Mock };
};

const mockRequest = () => ({ body: {} } as any);
const mockResponse = () => {
  const res = {} as any;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  return res;
};

describe("backupController — getLatestBackup", () => {
  const orgId = "org-123";
  const slug = "mi-ferreteria";

  beforeEach(() => {
    jest.clearAllMocks();
    (tenantContext.requireOrganizationId as jest.Mock).mockReturnValue(orgId);
    (storage.downloadFromR2 as jest.Mock).mockResolvedValue({
      body: Buffer.from("mock-backup-data"),
      contentType: "application/gzip",
      contentLength: 999,
    });
  });

  it("returns 200 with file download for valid ADMIN request", async () => {
    mockedDb.organization.findUnique.mockResolvedValue({ slug, name: "Mi Ferreteria" });

    const req = mockRequest();
    const res = mockResponse();

    await getLatestBackup(req, res);

    expect(mockedDb.organization.findUnique).toHaveBeenCalledWith({
      where: { id: orgId },
      select: { slug: true, name: true },
    });
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "application/gzip");
    expect(res.setHeader).toHaveBeenCalledWith("Content-Disposition", expect.stringContaining("mi-ferreteria"));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalled();
  });

  it("returns 404 when organization does not exist", async () => {
    mockedDb.organization.findUnique.mockResolvedValue(null);

    const req = mockRequest();
    const res = mockResponse();

    await getLatestBackup(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: "Organization not found" });
  });

  it("returns 404 when backup file not found in R2 (NoSuchKey)", async () => {
    mockedDb.organization.findUnique.mockResolvedValue({ slug, name: "Test" });
    const error = new Error("not found") as any;
    error.name = "NoSuchKey";
    (storage.downloadFromR2 as jest.Mock).mockRejectedValue(error);

    const req = mockRequest();
    const res = mockResponse();

    await getLatestBackup(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: "No backup available for today." });
  });

  it("returns 500 on unexpected R2 error", async () => {
    mockedDb.organization.findUnique.mockResolvedValue({ slug, name: "Test" });
    (storage.downloadFromR2 as jest.Mock).mockRejectedValue(new Error("R2 down"));

    const req = mockRequest();
    const res = mockResponse();

    await getLatestBackup(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Could not download backup. Please try again later.",
    });
  });

  it("sanitizes slug with special characters", async () => {
    mockedDb.organization.findUnique.mockResolvedValue({ slug: "mi/ferreteria:test", name: "Test" });

    const req = mockRequest();
    const res = mockResponse();

    await getLatestBackup(req, res);

    expect(storage.downloadFromR2).toHaveBeenCalledWith(
      expect.stringContaining("mi-ferreteria-test"),
    );
  });
});

/**
 * Unit tests for R2 storage utilities:
 * - sanitizeSlug
 * - generatePresignedUrl
 * - uploadBackupToR2
 */
import { sanitizeSlug } from "../../src/services/backupService";

// Mock S3Client and presigner BEFORE importing the module under test
const mockS3Send = jest.fn();

jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: mockS3Send,
  })),
  PutObjectCommand: jest.fn(),
  GetObjectCommand: jest.fn(),
}));

jest.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: jest.fn(),
}));

// --- sanitizeSlug (T04) ---

describe("sanitizeSlug", () => {
  it("replaces / with -", () => {
    expect(sanitizeSlug("foo/bar")).toBe("foo-bar");
  });

  it("replaces \\ with -", () => {
    expect(sanitizeSlug("foo\\bar")).toBe("foo-bar");
  });

  it("replaces : with -", () => {
    expect(sanitizeSlug("foo:bar")).toBe("foo-bar");
  });

  it("handles multiple special chars in one slug", () => {
    expect(sanitizeSlug("org/name:test\\v2")).toBe("org-name-test-v2");
  });

  it("returns slug unchanged when no special chars", () => {
    expect(sanitizeSlug("my-org-slug")).toBe("my-org-slug");
  });

  it("handles empty string", () => {
    expect(sanitizeSlug("")).toBe("");
  });
});

// --- generatePresignedUrl (T03) ---

describe("generatePresignedUrl", () => {
  let generatePresignedUrl: (key: string, expiresIn?: number) => Promise<string>;

  beforeAll(async () => {
    const mod = await import("../../src/config/storage");
    generatePresignedUrl = mod.generatePresignedUrl;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Must set env vars so getClient doesn't crash on missing credentials
    process.env.R2_ACCOUNT_ID = "test-account-id";
    process.env.R2_ACCESS_KEY_ID = "test-access-key";
    process.env.R2_SECRET_ACCESS_KEY = "test-secret-key";
    process.env.R2_BUCKET_NAME = "test-bucket";
  });

  it("generates a signed URL for a given key", async () => {
    const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
    getSignedUrl.mockResolvedValue("https://signed.example.com/backups/my-org/2026-07-31.sql.gz");

    const url = await generatePresignedUrl("backups/my-org/2026-07-31.sql.gz");

    expect(url).toBe("https://signed.example.com/backups/my-org/2026-07-31.sql.gz");
    expect(getSignedUrl).toHaveBeenCalledTimes(1);

    // Verify GetObjectCommand params
    const { GetObjectCommand } = require("@aws-sdk/client-s3");
    expect(GetObjectCommand).toHaveBeenCalledWith({
      Bucket: "test-bucket",
      Key: "backups/my-org/2026-07-31.sql.gz",
    });
  });

  it("defaults expiresIn to 3600 seconds", async () => {
    const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
    getSignedUrl.mockResolvedValue("https://signed.example.com/x");

    await generatePresignedUrl("backups/test/file.sql.gz");

    expect(getSignedUrl).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      { expiresIn: 3600 },
    );
  });

  it("accepts custom expiresIn", async () => {
    const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
    getSignedUrl.mockResolvedValue("https://signed.example.com/x");

    await generatePresignedUrl("backups/test/file.sql.gz", 7200);

    expect(getSignedUrl).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      { expiresIn: 7200 },
    );
  });
});

// --- uploadBackupToR2 (T02) ---

describe("uploadBackupToR2", () => {
  let uploadBackupToR2: (key: string, body: Buffer, contentType: string) => Promise<void>;

  beforeAll(async () => {
    const mod = await import("../../src/config/storage");
    uploadBackupToR2 = mod.uploadBackupToR2;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockS3Send.mockResolvedValue({});
    process.env.R2_ACCOUNT_ID = "test-account-id";
    process.env.R2_ACCESS_KEY_ID = "test-access-key";
    process.env.R2_SECRET_ACCESS_KEY = "test-secret-key";
    process.env.R2_BUCKET_NAME = "test-bucket";
  });

  it("uploads a buffer to R2 with correct PutObjectCommand params", async () => {
    const body = Buffer.from("fake sql gz content");
    const key = "backups/my-org/2026-07-31.sql.gz";

    await uploadBackupToR2(key, body, "application/gzip");

    const { PutObjectCommand } = require("@aws-sdk/client-s3");
    expect(mockS3Send).toHaveBeenCalledTimes(1);
    expect(PutObjectCommand).toHaveBeenCalledWith({
      Bucket: "test-bucket",
      Key: key,
      Body: body,
      ContentType: "application/gzip",
    });
  });

  it("propagates S3 errors", async () => {
    mockS3Send.mockRejectedValue(new Error("Network error"));

    const body = Buffer.from("data");
    await expect(
      uploadBackupToR2("backups/x/file.gz", body, "application/gzip"),
    ).rejects.toThrow("Network error");
  });
});

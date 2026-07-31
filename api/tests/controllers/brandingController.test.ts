import { Response } from "express";
import {
  getBranding,
  updateBranding,
} from "../../src/controllers/brandingController";
import { basePrisma } from "../../src/config/db";
import * as tenantContext from "../../src/config/tenantContext";

jest.mock("../../src/config/db", () => ({
  basePrisma: {
    appBranding: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    organization: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock("../../src/config/tenantContext", () => ({
  requireOrganizationId: jest.fn(),
}));

const mockedDb = basePrisma as unknown as {
  appBranding: { findUnique: jest.Mock; upsert: jest.Mock };
  organization: { findUnique: jest.Mock };
};

const mockRequest = (body: any = {}) => ({ body } as any);
const mockResponse = () => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("brandingController", () => {
  const orgId = "org-123";

  beforeEach(() => {
    jest.clearAllMocks();
    (tenantContext.requireOrganizationId as jest.Mock).mockReturnValue(orgId);
  });

  describe("getBranding", () => {
    it("returns defaults when no AppBranding row exists", async () => {
      mockedDb.appBranding.findUnique.mockResolvedValue(null);

      const req = mockRequest();
      const res = mockResponse();

      await getBranding(req, res);

      expect(mockedDb.appBranding.findUnique).toHaveBeenCalledWith({
        where: { organizationId: orgId },
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        primaryColor: "#111827",
        logoUrl: null,
        faviconUrl: null,
        displayName: null,
      });
    });

    it("returns persisted branding when row exists", async () => {
      const saved = {
        id: "b-1",
        organizationId: orgId,
        primaryColor: "#dc2626",
        logoUrl: "https://example.com/logo.png",
        faviconUrl: null,
        displayName: "Mi Negocio",
        updatedAt: new Date(),
      };
      mockedDb.appBranding.findUnique.mockResolvedValue(saved);

      const req = mockRequest();
      const res = mockResponse();

      await getBranding(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        primaryColor: "#dc2626",
        logoUrl: "https://example.com/logo.png",
        faviconUrl: null,
        displayName: "Mi Negocio",
      });
    });

    it("handles DB errors gracefully", async () => {
      mockedDb.appBranding.findUnique.mockRejectedValue(new Error("DB down"));

      const req = mockRequest();
      const res = mockResponse();

      await getBranding(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "DB down" });
    });
  });

  describe("updateBranding", () => {
    it("returns 403 when org plan is BASICO", async () => {
      mockedDb.organization.findUnique.mockResolvedValue({ plan: "BASICO" });

      const req = mockRequest({ primaryColor: "#ff0000" });
      const res = mockResponse();

      await updateBranding(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "PLAN_LIMIT",
        module: "branding",
      });
      expect(mockedDb.appBranding.upsert).not.toHaveBeenCalled();
    });

    it("upserts branding for non-BASIC plan (PRO)", async () => {
      mockedDb.organization.findUnique.mockResolvedValue({ plan: "PRO" });
      const upserted = {
        id: "b-1",
        organizationId: orgId,
        primaryColor: "#dc2626",
        logoUrl: null,
        faviconUrl: null,
        displayName: null,
        updatedAt: new Date(),
      };
      mockedDb.appBranding.upsert.mockResolvedValue(upserted);

      const req = mockRequest({ primaryColor: "#dc2626" });
      const res = mockResponse();

      await updateBranding(req, res);

      expect(mockedDb.appBranding.upsert).toHaveBeenCalledWith({
        where: { organizationId: orgId },
        update: { primaryColor: "#dc2626" },
        create: { organizationId: orgId, primaryColor: "#dc2626" },
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        primaryColor: "#dc2626",
        logoUrl: null,
        faviconUrl: null,
        displayName: null,
      });
    });

    it("upserts branding for PREMIUM plan", async () => {
      mockedDb.organization.findUnique.mockResolvedValue({ plan: "PREMIUM" });
      mockedDb.appBranding.upsert.mockResolvedValue({
        id: "b-2",
        organizationId: orgId,
        primaryColor: "#111827",
        logoUrl: null,
        faviconUrl: null,
        displayName: null,
        updatedAt: new Date(),
      });

      const req = mockRequest({ displayName: "Empresa X" });
      const res = mockResponse();

      await updateBranding(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("handles DB errors gracefully on update", async () => {
      mockedDb.organization.findUnique.mockResolvedValue({ plan: "PRO" });
      mockedDb.appBranding.upsert.mockRejectedValue(new Error("Unique constraint"));

      const req = mockRequest({ primaryColor: "#ff0000" });
      const res = mockResponse();

      await updateBranding(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});

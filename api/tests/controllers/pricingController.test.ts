import { Response } from "express";
import {
  getPricingSetting,
  updatePricingSetting,
} from "../../src/controllers/pricingController";
import { basePrisma } from "../../src/config/db";
import * as tenantContext from "../../src/config/tenantContext";

jest.mock("../../src/config/db", () => ({
  basePrisma: {
    pricingSetting: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    organization: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock("../../src/config/tenantContext", () => ({
  requireOrganizationId: jest.fn(),
}));

jest.mock("../../src/services/priceLooseService", () => ({
  recomputeForFactorSave: jest.fn(),
}));

import { recomputeForFactorSave } from "../../src/services/priceLooseService";

const mockedDb = basePrisma as unknown as {
  pricingSetting: { findUnique: jest.Mock; upsert: jest.Mock };
  organization: { findUnique: jest.Mock };
  $transaction: jest.Mock;
};

const mockedRecompute = recomputeForFactorSave as unknown as jest.Mock;

const mockRequest = (body: any = {}, query: any = {}) =>
  ({ body, query } as any);
const mockResponse = () => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("pricingController", () => {
  const orgId = "org-123";

  beforeEach(() => {
    jest.clearAllMocks();
    (tenantContext.requireOrganizationId as jest.Mock).mockReturnValue(orgId);
  });

  describe("getPricingSetting", () => {
    it("returns the org default bulkFactor 1.20 when no row exists (B-02)", async () => {
      mockedDb.pricingSetting.findUnique.mockResolvedValue(null);

      const req = mockRequest();
      const res = mockResponse();

      await getPricingSetting(req, res);

      expect(mockedDb.pricingSetting.findUnique).toHaveBeenCalledWith({
        where: { organizationId: orgId },
      });
      expect(res.status).toHaveBeenCalledWith(200);
      // Org A's factor never leaks: org B without a row always gets 1.20 (B-02/B-10).
      expect(res.json).toHaveBeenCalledWith({ bulkFactor: 1.2 });
    });

    it("returns the persisted factor when a row exists", async () => {
      mockedDb.pricingSetting.findUnique.mockResolvedValue({
        id: "ps-1",
        organizationId: orgId,
        bulkFactor: 1.35,
      });

      const req = mockRequest();
      const res = mockResponse();

      await getPricingSetting(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ bulkFactor: 1.35 });
    });

    it("handles DB errors gracefully", async () => {
      mockedDb.pricingSetting.findUnique.mockRejectedValue(
        new Error("DB down"),
      );

      const req = mockRequest();
      const res = mockResponse();

      await getPricingSetting(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "DB down" });
    });
  });

  describe("updatePricingSetting", () => {
    it("returns 403 PLAN_LIMIT when the org plan is BASICO", async () => {
      mockedDb.organization.findUnique.mockResolvedValue({ plan: "BASICO" });

      const req = mockRequest({ bulkFactor: 1.25 });
      const res = mockResponse();

      await updatePricingSetting(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "PLAN_LIMIT",
        module: "pricing",
      });
      expect(mockedDb.pricingSetting.upsert).not.toHaveBeenCalled();
    });

    it("dry-run: returns affected count + before/after sample WITHOUT writing (A-01)", async () => {
      mockedDb.organization.findUnique.mockResolvedValue({ plan: "PRO" });
      const tx = {};
      mockedDb.$transaction.mockImplementation((cb: any) => cb(tx));
      mockedRecompute.mockResolvedValue({
        affected: 42,
        sample: [
          { id: "p-1", name: "Alimento 15kg", oldKgPrice: null, newKgPrice: 360 },
          { id: "p-2", name: "Alimento 7.5kg", oldKgPrice: 180, newKgPrice: 187.5 },
        ],
      });

      const req = mockRequest({ bulkFactor: 1.25 }, { dryRun: "true" });
      const res = mockResponse();

      await updatePricingSetting(req, res);

      expect(mockedDb.pricingSetting.upsert).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        affected: 42,
        sample: [
          { id: "p-1", name: "Alimento 15kg", oldKgPrice: null, newKgPrice: 360 },
          { id: "p-2", name: "Alimento 7.5kg", oldKgPrice: 180, newKgPrice: 187.5 },
        ],
      });
    });

    it("saves factor + recomputes in the same tx (B-05a), returns recomputed count", async () => {
      mockedDb.organization.findUnique.mockResolvedValue({ plan: "PREMIUM" });
      // $transaction must pass a tx that has pricingSetting.upsert so the
      // controller can call tx.pricingSetting.upsert(...) inside the callback.
      mockedDb.$transaction.mockImplementation(
        async (cb: any) => cb(mockedDb),
      );
      mockedDb.pricingSetting.upsert.mockResolvedValue({
        id: "ps-1",
        organizationId: orgId,
        bulkFactor: 1.25,
      });
      mockedRecompute.mockResolvedValue({ affected: 42 });

      const req = mockRequest({ bulkFactor: 1.25 });
      const res = mockResponse();

      await updatePricingSetting(req, res);

      expect(mockedDb.pricingSetting.upsert).toHaveBeenCalledWith({
        where: { organizationId: orgId },
        update: { bulkFactor: 1.25 },
        create: { organizationId: orgId, bulkFactor: 1.25 },
      });
      // Recompute runs INSIDE the same transaction as the upsert.
      expect(mockedRecompute).toHaveBeenCalledWith(mockedDb, orgId, 1.25);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        bulkFactor: 1.25,
        recomputed: 42,
      });
    });

    it("factor save leaves per-product overrides intact (B-05a) — recompute gets the tx", async () => {
      mockedDb.organization.findUnique.mockResolvedValue({ plan: "PRO" });
      mockedDb.$transaction.mockImplementation(
        async (cb: any) => cb(mockedDb),
      );
      mockedDb.pricingSetting.upsert.mockResolvedValue({
        id: "ps-1",
        organizationId: orgId,
        bulkFactor: 1.3,
      });
      mockedRecompute.mockResolvedValue({ affected: 3 });

      const req = mockRequest({ bulkFactor: 1.3 });
      const res = mockResponse();

      await updatePricingSetting(req, res);

      expect(mockedRecompute).toHaveBeenCalledWith(mockedDb, orgId, 1.3);
      // The WHERE bulkFactor IS NULL semantics live in the service (unit-tested);
      // the controller only guarantees the tx + org scoping.
      expect(mockedDb.pricingSetting.upsert).toHaveBeenCalledTimes(1);
    });

    it("handles DB errors gracefully on save", async () => {
      mockedDb.organization.findUnique.mockResolvedValue({ plan: "PRO" });
      mockedDb.pricingSetting.upsert.mockRejectedValue(
        new Error("Unique constraint"),
      );

      const req = mockRequest({ bulkFactor: 1.25 });
      const res = mockResponse();

      await updatePricingSetting(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});
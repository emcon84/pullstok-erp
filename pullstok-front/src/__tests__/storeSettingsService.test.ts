import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGet, mockPut } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPut: vi.fn(),
}));

vi.mock("axios", () => ({
  default: { get: mockGet, put: mockPut },
}));

import {
  getStoreSettings,
  updateStoreSettings,
} from "../services/storeSettingsService";

/**
 * Contract tests for the storeBranchId field (spec S1 / task 5.6): the
 * service must forward the configured branch to the API on update and return
 * it on fetch, so the Tienda selector can persist which branch feeds the
 * online store.
 */
describe("storeSettingsService — storeBranchId", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPut.mockReset();
  });

  it("sends storeBranchId in the update payload", async () => {
    mockPut.mockResolvedValue({
      data: { primaryColor: "#000", storeBranchId: "b2" },
    });

    await updateStoreSettings({ primaryColor: "#000", storeBranchId: "b2" });

    expect(mockPut).toHaveBeenCalledWith(
      expect.stringContaining("/store-settings"),
      expect.objectContaining({ storeBranchId: "b2" }),
      expect.anything(),
    );
  });

  it("returns storeBranchId from the fetched settings", async () => {
    mockGet.mockResolvedValue({
      data: {
        primaryColor: "#fff",
        storeBranchId: "b2",
      },
    });

    const settings = await getStoreSettings();

    expect(settings.storeBranchId).toBe("b2");
  });
});

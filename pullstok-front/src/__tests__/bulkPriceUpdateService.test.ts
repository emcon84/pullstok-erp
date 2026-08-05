import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));

vi.stubGlobal("fetch", mockFetch);

import { bulkPriceUpdate } from "../services/productService";
import type { BulkPriceUpdatePayload } from "../services/productService";

const payload: BulkPriceUpdatePayload = {
  brandValues: ["Acme"],
  categoryIds: ["a"],
  excludeProductIds: ["p-9"],
  percentage: 15,
};

describe("bulkPriceUpdate service — dryRun preview + apply", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("token", "test-token");
    mockFetch.mockReset();
  });

  it("sends the payload with the auth token on a dryRun preview (page 1)", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ affected: 2, rows: [] }),
    });

    await bulkPriceUpdate(payload, true);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/products/bulk-price-update?dryRun=true&page=1"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify(payload),
      }),
    );
  });

  it("passes the requested page to the dryRun endpoint", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ affected: 2, rows: [] }),
    });

    await bulkPriceUpdate(payload, true, 2);

    expect(mockFetch.mock.calls[0][0]).toContain("page=2");
  });

  it("calls the plain endpoint (no dryRun flag) for an apply", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ affected: 2, previousTotal: 100, newTotal: 115 }),
    });

    await bulkPriceUpdate(payload, false);

    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain("/products/bulk-price-update");
    expect(url).not.toContain("dryRun");
  });

  it("throws the server message when the request fails", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => ({
        message: "El lote supera el máximo de 400 productos",
      }),
    });

    await expect(bulkPriceUpdate(payload, false)).rejects.toThrow(
      "El lote supera el máximo de 400 productos",
    );
  });

  it("returns the parsed preview/apply envelope", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        affected: 2,
        previousTotal: 100,
        newTotal: 115,
        page: 1,
        pageSize: 50,
        total: 2,
        rows: [],
      }),
    });

    const result = await bulkPriceUpdate(payload, false);

    expect(result).toEqual({
      affected: 2,
      previousTotal: 100,
      newTotal: 115,
      page: 1,
      pageSize: 50,
      total: 2,
      rows: [],
    });
  });
});

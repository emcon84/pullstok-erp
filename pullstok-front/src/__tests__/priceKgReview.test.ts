import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));
vi.stubGlobal("fetch", mockFetch);

import {
  listQueue,
  autoApply,
  approveEntry,
  rejectEntry,
  listProductsForCell,
} from "../services/priceKgReview";

const QUEUE_ENTRY = {
  id: "e1",
  productId: "p1",
  productName: "PRO PLAN ADULTO PERRO 12KG",
  priceKgPriceId: "c1",
  brandName: "PRO PLAN",
  typeName: "Adulto",
  species: "PERRO",
  reason: "FUZZY_MATCH",
  status: "PENDING",
  oldPriceKg: 7500,
  newPriceKg: 9200,
  reviewedBy: null,
  appliedAt: null,
  createdAt: "2026-08-01T10:00:00Z",
};

describe("priceKgReview service — cola de revisión y productos por celda", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("token", "test-token");
    mockFetch.mockReset();
  });

  describe("listQueue", () => {
    it("GET /price-kg-review/queue con filtros y paginación en query", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ items: [QUEUE_ENTRY], total: 1, page: 1 }),
      });

      const result = await listQueue({ status: "PENDING", page: 2, limit: 10 });

      expect(result.items).toEqual([QUEUE_ENTRY]);
      expect(result.total).toBe(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(
          "/price-kg-review/queue?status=PENDING&page=2&limit=10",
        ),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
        }),
      );
    });

    it("lanza el mensaje del server cuando falla", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: async () => ({ message: "Error al listar" }),
      });

      await expect(listQueue({})).rejects.toThrow("Error al listar");
    });
  });

  describe("autoApply", () => {
    it("POST /price-kg-review/auto-apply y devuelve {applied, queued, skipped}", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ applied: 5, queued: 3, skipped: 2 }),
      });

      const result = await autoApply();

      expect(result).toEqual({ applied: 5, queued: 3, skipped: 2 });
      expect(mockFetch.mock.calls[0][0]).toContain("/price-kg-review/auto-apply");
      expect(mockFetch.mock.calls[0][1].method).toBe("POST");
    });
  });

  describe("approveEntry / rejectEntry", () => {
    it("approveEntry hace POST a /queue/:id/approve", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });

      await approveEntry("e1");

      expect(mockFetch.mock.calls[0][0]).toContain(
        "/price-kg-review/queue/e1/approve",
      );
      expect(mockFetch.mock.calls[0][1].method).toBe("POST");
    });

    it("rejectEntry hace POST a /queue/:id/reject", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });

      await rejectEntry("e1");

      expect(mockFetch.mock.calls[0][0]).toContain(
        "/price-kg-review/queue/e1/reject",
      );
      expect(mockFetch.mock.calls[0][1].method).toBe("POST");
    });
  });

  describe("listProductsForCell", () => {
    it("GET /price-kg-products con brandId+typeId+species", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => [
          {
            id: "p1",
            name: "PRO PLAN ADULTO PERRO 12KG",
            weightKg: 12,
            stock: 5,
            priceKgSuelto: 8500,
            category: "Alimento Seco Perro",
            exact: true,
          },
        ],
      });

      const result = await listProductsForCell({
        brandId: "b-proplan",
        typeId: "t-adulto",
        species: "PERRO",
      });

      expect(result).toEqual([
        expect.objectContaining({ id: "p1", name: "PRO PLAN ADULTO PERRO 12KG" }),
      ]);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(
          "/price-kg-products?brandId=b-proplan&typeId=t-adulto&species=PERRO",
        ),
        expect.any(Object),
      );
    });
  });
});
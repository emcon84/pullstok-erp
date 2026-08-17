import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));
vi.stubGlobal("fetch", mockFetch);

import {
  getLooseStock,
  setLooseStock,
  listLooseStocks,
  openBag,
} from "../services/looseStock";

describe("looseStock service — stock suelto de la planilla", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("token", "test-token");
    mockFetch.mockReset();
  });

  describe("getLooseStock", () => {
    it("GET /loose-stock/:lineId?branchId= y devuelve la línea", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          lineId: "c1",
          priceKgPriceId: "c1",
          branchId: "b1",
          quantity: 15.5,
        }),
      });

      const result = await getLooseStock("c1", "b1");

      expect(result.quantity).toBe(15.5);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/loose-stock/c1?branchId=b1"),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
        }),
      );
    });

    it("sin branchId omite el query param", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ lineId: "c1", branchId: "b1", quantity: 0 }),
      });

      await getLooseStock("c1");

      expect(mockFetch.mock.calls[0][0]).not.toContain("?");
    });

    it("celda inexistente → lanza el mensaje del server (404)", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ message: "Línea de la planilla no encontrada" }),
      });

      await expect(getLooseStock("nope", "b1")).rejects.toThrow(
        "Línea de la planilla no encontrada",
      );
    });
  });

  describe("setLooseStock", () => {
    it("PUT /loose-stock/:lineId con { branchId, quantity }", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ lineId: "c1", branchId: "b1", quantity: 20 }),
      });

      const result = await setLooseStock("c1", { branchId: "b1", quantity: 20 });

      expect(result.quantity).toBe(20);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain("/loose-stock/c1");
      expect(init.method).toBe("PUT");
      expect(JSON.parse(init.body)).toEqual({ branchId: "b1", quantity: 20 });
    });

    it("errores de dominio → lanza data.message", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: async () => ({ message: "Stock suelto inválido" }),
      });

      await expect(
        setLooseStock("c1", { branchId: "b1", quantity: -1 }),
      ).rejects.toThrow("Stock suelto inválido");
    });
  });

  describe("listLooseStocks", () => {
    it("GET /loose-stock con branchId opcional y devuelve { items }", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [
            {
              id: "ls1",
              priceKgPriceId: "c1",
              branchId: "b1",
              quantity: 5,
              lineName: "ACME · Adulto",
              branchName: "Sucursal 1",
            },
          ],
        }),
      });

      const result = await listLooseStocks("b1");

      expect(result.items).toHaveLength(1);
      expect(result.items[0].lineName).toBe("ACME · Adulto");
      expect(mockFetch.mock.calls[0][0]).toContain("/loose-stock?branchId=b1");
    });

    it("sin branchId lista toda la org (sin query)", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });

      await listLooseStocks();

      expect(mockFetch.mock.calls[0][0]).toContain("/loose-stock");
      expect(mockFetch.mock.calls[0][0]).not.toContain("?");
    });

    it("respuesta sin items → siempre un array", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
      const result = await listLooseStocks();
      expect(result.items).toEqual([]);
    });
  });

  describe("openBag", () => {
    it("POST /loose-stock/open-bag con { productId, branchId }", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({
          priceKgPriceId: "c1",
          branchId: "b1",
          quantity: 12,
        }),
      });

      const result = await openBag({ productId: "p1", branchId: "b1" });

      expect(result.quantity).toBe(12);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain("/loose-stock/open-bag");
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body)).toEqual({ productId: "p1", branchId: "b1" });
    });

    it("LOOSE_* 422 → lanza data.message (sin bolsa/peso/línea)", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          error: "LOOSE_BAG_NO_WEIGHT",
          message: '"ACME" no tiene peso (weightKg) configurado para abrir la bolsa',
        }),
      });

      await expect(openBag({ productId: "p1", branchId: "b1" })).rejects.toThrow(
        "no tiene peso",
      );
    });
  });
});
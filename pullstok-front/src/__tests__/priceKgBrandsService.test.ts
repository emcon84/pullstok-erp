import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));
vi.stubGlobal("fetch", mockFetch);

import {
  listPriceKgBrands,
  createPriceKgBrand,
  updatePriceKgBrand,
  deletePriceKgBrand,
  parseKeywords,
} from "../services/priceKgBrands";

describe("priceKgBrands service — cliente API de marcas por kilo", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("token", "test-token");
    mockFetch.mockReset();
  });

  describe("parseKeywords", () => {
    it("hace trim, filtra vacíos y deduplica sin distinguir mayúsculas", () => {
      expect(parseKeywords("MAXXIUM, maxxium, CORDERO, , MAXXIUM ")).toEqual([
        "MAXXIUM",
        "CORDERO",
      ]);
    });

    it("devuelve [] para un string vacío", () => {
      expect(parseKeywords("")).toEqual([]);
    });

    it("devuelve una única palabra clave sin comas", () => {
      expect(parseKeywords("MAXXIUM")).toEqual(["MAXXIUM"]);
    });
  });

  it("listPriceKgBrands devuelve data.items con el token", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [{ id: "b-1", name: "MAXXIUM CORDERO", keywords: ["MAXXIUM", "CORDERO"] }],
      }),
    });

    const result = await listPriceKgBrands();

    expect(result).toEqual([
      { id: "b-1", name: "MAXXIUM CORDERO", keywords: ["MAXXIUM", "CORDERO"] },
    ]);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/price-kg-brands"),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
      }),
    );
  });

  it("createPriceKgBrand envía name y keywords y devuelve la marca", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "b-1", name: "MAXXIUM", keywords: ["MAXXIUM", "CORDERO"] }),
    });

    const result = await createPriceKgBrand({
      name: "MAXXIUM CORDERO",
      keywords: ["MAXXIUM", "CORDERO"],
    });

    expect(result).toEqual({
      id: "b-1",
      name: "MAXXIUM",
      keywords: ["MAXXIUM", "CORDERO"],
    });
    expect(mockFetch.mock.calls[0][1].method).toBe("POST");
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({
      name: "MAXXIUM CORDERO",
      keywords: ["MAXXIUM", "CORDERO"],
    });
  });

  it("createPriceKgBrand lanza el mensaje del server cuando falla", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ message: "Ya existe una marca con ese nombre" }),
    });

    await expect(
      createPriceKgBrand({ name: "MAXXIUM", keywords: [] }),
    ).rejects.toThrow("Ya existe una marca con ese nombre");
  });

  it("updatePriceKgBrand hace PUT a /:id", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "b-1", name: "MAXXIUM", keywords: ["MAXXIUM", "CORDERO"] }),
    });

    await updatePriceKgBrand("b-1", { keywords: ["MAXXIUM", "CORDERO"] });

    expect(mockFetch.mock.calls[0][0]).toContain("/price-kg-brands/b-1");
    expect(mockFetch.mock.calls[0][1].method).toBe("PUT");
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({
      keywords: ["MAXXIUM", "CORDERO"],
    });
  });

  it("deletePriceKgBrand hace DELETE a /:id y no devuelve nada", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

    await deletePriceKgBrand("b-1");

    expect(mockFetch.mock.calls[0][0]).toContain("/price-kg-brands/b-1");
    expect(mockFetch.mock.calls[0][1].method).toBe("DELETE");
  });
});

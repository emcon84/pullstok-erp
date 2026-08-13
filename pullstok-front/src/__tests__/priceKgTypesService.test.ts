import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));
vi.stubGlobal("fetch", mockFetch);

import {
  listPriceKgTypes,
  createPriceKgType,
  updatePriceKgType,
  deletePriceKgType,
  parseSynonyms,
} from "../services/priceKgTypes";

describe("priceKgTypes service — cliente API de tipos por kilo", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("token", "test-token");
    mockFetch.mockReset();
  });

  describe("parseSynonyms", () => {
    it("hace trim, filtra vacíos y deduplica sin distinguir mayúsculas", () => {
      expect(parseSynonyms("Adulto, adulto, Maduro, , Adulto ")).toEqual([
        "Adulto",
        "Maduro",
      ]);
    });

    it("devuelve [] para un string vacío", () => {
      expect(parseSynonyms("")).toEqual([]);
    });

    it("devuelve un único sinónimo sin comas", () => {
      expect(parseSynonyms("Puppy")).toEqual(["Puppy"]);
    });
  });

  it("listPriceKgTypes devuelve data.items con el token", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ items: [{ id: "t-1", name: "Adulto", synonyms: ["Adult"] }] }),
    });

    const result = await listPriceKgTypes();

    expect(result).toEqual([{ id: "t-1", name: "Adulto", synonyms: ["Adult"] }]);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/price-kg-types"),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
      }),
    );
  });

  it("createPriceKgType envía name y synonyms y devuelve el tipo", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "t-1", name: "Adulto", synonyms: ["Adult"] }),
    });

    const result = await createPriceKgType({ name: "Adulto", synonyms: ["Adult"] });

    expect(result).toEqual({ id: "t-1", name: "Adulto", synonyms: ["Adult"] });
    expect(mockFetch.mock.calls[0][1].method).toBe("POST");
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({
      name: "Adulto",
      synonyms: ["Adult"],
    });
  });

  it("createPriceKgType lanza el mensaje del server cuando falla", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ message: "Ya existe un tipo con ese nombre" }),
    });

    await expect(
      createPriceKgType({ name: "Adulto", synonyms: [] }),
    ).rejects.toThrow("Ya existe un tipo con ese nombre");
  });

  it("updatePriceKgType hace PUT a /:id", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "t-1", name: "Adulto", synonyms: ["Adult", "Maduro"] }),
    });

    await updatePriceKgType("t-1", { synonyms: ["Adult", "Maduro"] });

    expect(mockFetch.mock.calls[0][0]).toContain("/price-kg-types/t-1");
    expect(mockFetch.mock.calls[0][1].method).toBe("PUT");
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({
      synonyms: ["Adult", "Maduro"],
    });
  });

  it("deletePriceKgType hace DELETE a /:id y no devuelve nada", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

    await deletePriceKgType("t-1");

    expect(mockFetch.mock.calls[0][0]).toContain("/price-kg-types/t-1");
    expect(mockFetch.mock.calls[0][1].method).toBe("DELETE");
  });
});

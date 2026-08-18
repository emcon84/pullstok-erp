import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));
vi.stubGlobal("fetch", mockFetch);

import {
  importPriceList,
  applyPriceList,
  getPriceLists,
  getPriceList,
  adjustPriceList,
  searchProducts,
} from "../services/priceLists";

const preview = {
  layout: "SECO",
  period: "2026-08-10",
  sourceFilename: "planilla.pdf",
  total: 2,
  rows: [
    {
      position: 0,
      nombre: "SIEGER Puppy Mini x 1 Kg.",
      unidadEmpaque: "1 Kg.",
      marca: "SIEGER",
      linea: "SUPER PREMIUM PARA PERROS",
      sublinea: "SIEGER PUPPY",
      precioSinIva: 8795,
      precioConIva: 10642,
      sugerido: 14190.04,
      estado: "matched",
      productId: "p-1",
      productIds: ["p-1"],
      matchName: "SIEGER Puppy Mini x 1 Kg.",
    },
    {
      position: 1,
      nombre: "STARTER Kit",
      unidadEmpaque: null,
      marca: null,
      linea: null,
      sublinea: null,
      precioSinIva: null,
      precioConIva: null,
      sugerido: null,
      estado: "error",
      productId: null,
    },
  ],
};

describe("priceLists service — cliente API de planillas", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("token", "test-token");
    mockFetch.mockReset();
  });

  it("importPriceList sube el PDF como multipart con el token (dryRun=true)", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => preview });

    const file = new File(["pdf"], "planilla.pdf", { type: "application/pdf" });
    const result = await importPriceList(file, true);

    expect(result.total).toBe(2);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/products/import-price-list?dryRun=true"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
      }),
    );
    // El body es FormData y NO se setea Content-Type manualmente.
    const call = mockFetch.mock.calls[0][1];
    expect(call.body).toBeInstanceOf(FormData);
    expect(call.headers["Content-Type"]).toBeUndefined();
  });

  it("importPriceList lanza error con status cuando el server responde 413/400", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 413,
      json: async () => ({ message: "El archivo excede 10MB" }),
    });
    const file = new File(["pdf"], "planilla.pdf", { type: "application/pdf" });
    await expect(importPriceList(file)).rejects.toMatchObject({
      status: 413,
      message: "El archivo excede 10MB",
    });
  });

  it("applyPriceList envía las decisiones como JSON", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ priceListId: "pl-1", imported: 1, omitted: 1, suggestedUpdated: 1 }),
    });
    const result = await applyPriceList({
      layout: "SECO",
      period: "2026-08-10",
      sourceFilename: "planilla.pdf",
      rows: [{ position: 0, accion: "import", productId: "p-1", nombre: "X" }],
    });
    expect(result.priceListId).toBe("pl-1");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/products/import-price-list/apply"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          layout: "SECO",
          period: "2026-08-10",
          sourceFilename: "planilla.pdf",
          rows: [{ position: 0, accion: "import", productId: "p-1", nombre: "X" }],
        }),
      }),
    );
  });

  it("getPriceLists consulta /price-lists con el token", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });
    await getPriceLists();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/price-lists"),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer test-token" }) }),
    );
  });

  it("getPriceList consulta el detalle por id", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "pl-1", sections: [] }),
    });
    await getPriceList("pl-1");
    expect(mockFetch.mock.calls[0][0]).toContain("/price-lists/pl-1");
  });

  it("adjustPriceList arma el query dryRun y envía el payload", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ affected: 2, previousTotal: 300, newTotal: 330, rows: [] }),
    });
    await adjustPriceList(
      "pl-1",
      { percentage: 10, excludeEntryIds: [], entryOverrides: [] },
      true,
    );
    expect(mockFetch.mock.calls[0][0]).toContain("/price-lists/pl-1/adjust?dryRun=true");
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({
      percentage: 10,
      excludeEntryIds: [],
      entryOverrides: [],
    });
  });

  it("searchProducts devuelve hits id/name/price (forma paginada del server)", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ items: [{ id: "p-1", name: "SIEGER Puppy Mini x 1 Kg.", price: 10642 }], total: 1 }),
    });
    const hits = await searchProducts("sieger puppy");
    expect(hits).toEqual([{ id: "p-1", name: "SIEGER Puppy Mini x 1 Kg.", price: 10642 }]);
    expect(mockFetch.mock.calls[0][0]).toContain("/products?name=sieger%20puppy");
  });
});

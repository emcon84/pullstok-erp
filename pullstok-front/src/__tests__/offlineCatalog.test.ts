import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/constants", () => ({
  API_URL: "http://localhost:5000/api",
}));

import {
  patchProduct,
  removeProductFromCatalog,
  fetchAndPatchProduct,
  storeOfflineSnapshot,
  searchProducts,
  lookupProductByCode,
  catalogSize,
} from "../lib/offlineCatalog";
import type { OfflineProduct } from "../lib/offlineCatalog";

const baseProduct = (overrides: Partial<OfflineProduct> = {}): OfflineProduct => ({
  id: "p1",
  name: "ACME Adulto Perro 15kg",
  code: "COD-1",
  barcode: "7791234567890",
  price: 18400,
  priceKgLista: null,
  priceKgSuelto: null,
  priceKgSueltoManual: false,
  description: null,
  categoryId: null,
  categoryName: null,
  variants: [],
  ...overrides,
});

describe("offlineCatalog — patch puntual (T3)", () => {
  beforeEach(() => {
    // Reseteamos el estado del módulo repoblando con una lista conocida vía
    // storeOfflineSnapshot (no hay reset exportado; jsdom no tiene
    // IndexedDB, así que esta llamada también ejerce el catch defensivo).
    return storeOfflineSnapshot([]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  describe("patchProduct", () => {
    it("agrega un producto nuevo y lo deja buscable por code/barcode y por nombre", async () => {
      const product = baseProduct();

      await patchProduct(product);

      expect(catalogSize()).toBe(1);
      expect(lookupProductByCode("COD-1")).toEqual(product);
      expect(lookupProductByCode("7791234567890")).toEqual(product);
      expect(searchProducts("acme adulto")).toEqual([product]);
    });

    it("actualiza un producto existente (mismo id) sin duplicarlo y con los datos nuevos", async () => {
      const original = baseProduct();
      await patchProduct(original);

      const updated = baseProduct({
        name: "ACME Adulto Perro 15kg (nuevo precio)",
        price: 19900,
        code: "COD-1-NEW",
      });
      await patchProduct(updated);

      expect(catalogSize()).toBe(1);
      // El code viejo ya no debe resolver (se reindexó).
      expect(lookupProductByCode("COD-1")).toBeNull();
      expect(lookupProductByCode("COD-1-NEW")).toEqual(updated);
      expect(lookupProductByCode("7791234567890")).toEqual(updated);
      expect(searchProducts("nuevo precio")).toEqual([updated]);
    });
  });

  describe("removeProductFromCatalog", () => {
    it("saca el producto del catálogo y deja de aparecer en búsquedas", async () => {
      const product = baseProduct();
      await patchProduct(product);
      expect(catalogSize()).toBe(1);

      await removeProductFromCatalog("p1");

      expect(catalogSize()).toBe(0);
      expect(lookupProductByCode("COD-1")).toBeNull();
      expect(lookupProductByCode("7791234567890")).toBeNull();
      expect(searchProducts("acme")).toEqual([]);
    });

    it("es un no-op seguro si el id no existe", async () => {
      await expect(removeProductFromCatalog("no-existe")).resolves.toBeUndefined();
      expect(catalogSize()).toBe(0);
    });
  });

  describe("fetchAndPatchProduct", () => {
    beforeEach(() => {
      localStorage.setItem("token", "tok-123");
    });

    it("200 OK: parsea el JSON y patchea el producto", async () => {
      const product = baseProduct();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: () => Promise.resolve(product),
        }),
      );

      await fetchAndPatchProduct("p1");

      expect(fetch).toHaveBeenCalledWith(
        "http://localhost:5000/api/products/p1/offline-snapshot",
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: "Bearer tok-123" }),
        }),
      );
      expect(lookupProductByCode("COD-1")).toEqual(product);
    });

    it("404: remueve el producto local en vez de tirar error", async () => {
      await patchProduct(baseProduct());
      expect(catalogSize()).toBe(1);

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
          json: () => Promise.resolve({ message: "not found" }),
        }),
      );

      await expect(fetchAndPatchProduct("p1")).resolves.toBeUndefined();
      expect(catalogSize()).toBe(0);
    });

    it("otro error HTTP (500): no rompe y no modifica el catálogo", async () => {
      await patchProduct(baseProduct());

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ message: "boom" }),
        }),
      );

      await expect(fetchAndPatchProduct("p1")).resolves.toBeUndefined();
      expect(catalogSize()).toBe(1);
      expect(lookupProductByCode("COD-1")).not.toBeNull();
    });

    it("error de red: no rompe (no lanza excepción)", async () => {
      await patchProduct(baseProduct());

      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("network down")),
      );

      await expect(fetchAndPatchProduct("p1")).resolves.toBeUndefined();
      expect(catalogSize()).toBe(1);
    });

    it("sin token: no hace fetch y no rompe", async () => {
      localStorage.removeItem("token");
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      await expect(fetchAndPatchProduct("p1")).resolves.toBeUndefined();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});

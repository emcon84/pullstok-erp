import {
  normalizeName,
  levenshtein,
  matchFuzzy,
  resolveBrand,
  resolveType,
  resolveSpeciesFromCategory,
  isLooseEligible,
  findAlimentoSecoCategoryIds,
  autoApply,
  type Species,
} from "../../src/services/priceMatchingService";

/** Shapes mínimos (parciales) de las filas de Prisma que consume el service. */
interface BrandLike {
  id: string;
  name: string;
  keywords: string[];
}
interface TypeLike {
  id: string;
  name: string;
  synonyms: string[];
}
interface CategoryLike {
  id: string;
  name: string;
  parentId: string | null;
}
interface CellLike {
  id: string;
  brandId: string;
  typeId: string;
  species: Species;
  priceKg: number;
}
interface ProductLike {
  id: string;
  name: string;
  categoryId: string | null;
  priceKgSuelto: number | null;
  priceKgSueltoManual: boolean;
}

const brands: BrandLike[] = [
  { id: "b-proplan", name: "PRO PLAN", keywords: ["PROPLAN"] },
  { id: "b-balance", name: "Balance", keywords: ["BALANCED", "BALANCE"] },
  { id: "b-royal", name: "Royal Canin", keywords: ["ROYAL CANIN"] },
];

const types: TypeLike[] = [
  { id: "t-adulto", name: "Adulto", synonyms: ["ADULT"] },
  { id: "t-gatito", name: "Gatito", synonyms: ["Kitten", "Gatitos", "Cachorro"] },
  { id: "t-mediana", name: "Mediana", synonyms: [] },
];

const cats = (): CategoryLike[] => [
  { id: "alimento", name: "Alimento Seco", parentId: null },
  { id: "cat-perro", name: "Perro", parentId: "alimento" },
  { id: "cat-gato", name: "Gato", parentId: "alimento" },
];

const mockTx = () => ({
  category: { findMany: jest.fn() },
  priceKgBrand: { findMany: jest.fn() },
  priceKgType: { findMany: jest.fn() },
  priceKgPrice: { findMany: jest.fn() },
  product: {
    findMany: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
  reviewQueueEntry: { create: jest.fn().mockResolvedValue({ id: "q1" }) },
});

describe("normalizeName — NFD, lowercase, sin acentos, whitespace colapsado", () => {
  it("descompone, baja a minúsculas y colapsa espacios", () => {
    expect(normalizeName("PRO PLAN  ADULTO  PERRO  12KG")).toBe(
      "pro plan adulto perro 12kg",
    );
  });

  it("strippea acentos (ÁÉÍÓÚ → aeiou)", () => {
    expect(normalizeName("GATITOS CACHORRO ÁRBOL")).toBe("gatitos cachorro arbol");
  });

  it("normaliza a la MISMA key que su variante en minúsculas sin acentos", () => {
    expect(normalizeName("ROYAL CANIN KITTEN 2KG")).toBe(
      normalizeName("royal canin kitten 2kg"),
    );
  });
});

describe("levenshtein / matchFuzzy — distancia ≤ 2", () => {
  it("MEDIAMA → MEDIANA (distancia 1) matchea fuzzy", () => {
    expect(levenshtein("mediama", "mediana")).toBe(1);
    expect(matchFuzzy("mediama", "mediana")).toBe(true);
  });

  it("no matchea fuzzy palabras lejanas (kitten vs adulto)", () => {
    expect(levenshtein("kitten", "adulto")).toBeGreaterThan(2);
    expect(matchFuzzy("kitten", "adulto")).toBe(false);
  });

  it("distancia 0 matchea (identidad)", () => {
    expect(matchFuzzy("adulto", "adulto")).toBe(true);
  });
});

describe("resolveBrand — keywords + extracción por prefijo", () => {
  it("extrae marca por prefijo del nombre normalizado (PRO PLAN ...)", () => {
    const res = resolveBrand("pro plan senior gato", brands);
    expect(res.exact).toBe(true);
    expect(res.brand?.id).toBe("b-proplan");
  });

  it("resuelve keyword PROPLAN → PRO PLAN", () => {
    const res = resolveBrand("proplan senior gato 10kg", brands);
    expect(res.exact).toBe(true);
    expect(res.brand?.id).toBe("b-proplan");
  });

  it("resuelve keyword BALANCED → Balance", () => {
    const res = resolveBrand("balanced adulto cordero 14kg", brands);
    expect(res.exact).toBe(true);
    expect(res.brand?.id).toBe("b-balance");
  });

  it("resuelve marca multi-token por prefijo (Royal Canin kitten)", () => {
    const res = resolveBrand("royal canin kitten 2kg", brands);
    expect(res.exact).toBe(true);
    expect(res.brand?.id).toBe("b-royal");
  });

  it("devuelve undefined para una marca desconocida", () => {
    const res = resolveBrand("gooster cachorros 15kg", brands);
    expect(res.brand).toBeUndefined();
    expect(res.exact).toBe(false);
  });
});

describe("resolveType — exacto + sinónimos + fuzzy", () => {
  it("matchea etapa exacta por nombre (Adulto)", () => {
    const res = resolveType("pro plan adulto perro", types, "PRO PLAN");
    expect(res.exact).toBe(true);
    expect(res.type?.id).toBe("t-adulto");
  });

  it("resuelve sinónimo Kitten → Gatito", () => {
    const res = resolveType("royal canin kitten 2kg", types, "Royal Canin");
    expect(res.exact).toBe(true);
    expect(res.type?.id).toBe("t-gatito");
  });

  it("resuelve sinónimo ADULT → Adulto", () => {
    const res = resolveType("balance adult perro", types, "Balance");
    expect(res.exact).toBe(true);
    expect(res.type?.id).toBe("t-adulto");
  });

  it("matchea fuzzy MEDIAMA → Mediana (lev ≤ 2)", () => {
    const res = resolveType("pro plan mediama perro 12kg", types, "PRO PLAN");
    expect(res.exact).toBe(false);
    expect(res.type?.id).toBe("t-mediana");
  });

  it("devuelve undefined sin etapa reconocida", () => {
    const res = resolveType("marca sin etapa conocida", types, "Marca");
    expect(res.type).toBeUndefined();
  });
});

describe("resolveSpeciesFromCategory — especie desde categoría padre", () => {
  it("Alimento Seco > Perro → PERRO", () => {
    expect(resolveSpeciesFromCategory("Perro", "Alimento Seco")).toBe("PERRO");
  });

  it("Alimento Seco > Gato → GATO", () => {
    expect(resolveSpeciesFromCategory("Gato", "Alimento Seco")).toBe("GATO");
  });

  it("categoría sin indicio → AMBOS", () => {
    expect(resolveSpeciesFromCategory("Adulto", "Alimento Seco")).toBe("AMBOS");
  });
});

describe("isLooseEligible — priceKgSuelto > 0", () => {
  it("elegible con priceKgSuelto positivo", () => {
    expect(isLooseEligible({ priceKgSuelto: 8500 })).toBe(true);
  });

  it("no elegible con null/0", () => {
    expect(isLooseEligible({ priceKgSuelto: null })).toBe(false);
    expect(isLooseEligible({ priceKgSuelto: 0 })).toBe(false);
  });
});

describe("findAlimentoSecoCategoryIds — hijos + la propia raíz", () => {
  it("devuelve la categoría raíz y sus hijos directos", () => {
    const ids = findAlimentoSecoCategoryIds(cats());
    expect(ids.sort()).toEqual(["alimento", "cat-perro", "cat-gato"].sort());
  });
});

describe("autoApply — protección de manuales y match exacto", () => {
  const setup = (tx: ReturnType<typeof mockTx>, products: ProductLike[], cells: CellLike[]) => {
    tx.category.findMany.mockResolvedValue(cats());
    tx.priceKgBrand.findMany.mockResolvedValue(brands);
    tx.priceKgType.findMany.mockResolvedValue(types);
    tx.priceKgPrice.findMany.mockResolvedValue(cells);
    tx.product.findMany.mockResolvedValue(products);
    return tx;
  };

  it("NUNCA sobrescribe un producto manual: crea entrada MANUAL_OVERRIDE y deja el precio intacto", async () => {
    const tx = setup(mockTx(), [
      {
        id: "p1",
        name: "PRO PLAN ADULTO PERRO 12KG",
        categoryId: "cat-perro",
        priceKgSuelto: 9200,
        priceKgSueltoManual: true,
      },
    ], [
      { id: "c1", brandId: "b-proplan", typeId: "t-adulto", species: "PERRO", priceKg: 8500 },
    ]);

    const result = await autoApply(tx, "org-1");

    // Precio intacto: NO se escribió el producto.
    expect(tx.product.updateMany).not.toHaveBeenCalled();
    // Entrada de revisión MANUAL_OVERRIDE con el precio de la celda como nuevo.
    expect(tx.reviewQueueEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productId: "p1",
          reason: "MANUAL_OVERRIDE",
          status: "PENDING",
          oldPriceKg: 9200,
          newPriceKg: 8500,
          organizationId: "org-1",
        }),
      }),
    );
    expect(result).toEqual({ applied: 0, queued: 1, skipped: 0 });
  });

  it("match exacto en producto NO manual: actualiza priceKgSuelto y NO crea entrada", async () => {
    const tx = setup(mockTx(), [
      {
        id: "p2",
        name: "PRO PLAN ADULTO PERRO 12KG",
        categoryId: "cat-perro",
        priceKgSuelto: 7000,
        priceKgSueltoManual: false,
      },
    ], [
      { id: "c1", brandId: "b-proplan", typeId: "t-adulto", species: "PERRO", priceKg: 8500 },
    ]);

    const result = await autoApply(tx, "org-1");

    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { id: "p2", organizationId: "org-1", priceKgSueltoManual: false },
      data: { priceKgSuelto: 8500 },
    });
    expect(tx.reviewQueueEntry.create).not.toHaveBeenCalled();
    expect(result).toEqual({ applied: 1, queued: 0, skipped: 0 });
  });

  it("matchea fuzzy por etapa (MEDIAMA→Mediana): va a la cola FUZZY_MATCH sin escribir", async () => {
    const tx = setup(mockTx(), [
      {
        id: "p3",
        name: "PRO PLAN MEDIAMA PERRO 12KG",
        categoryId: "cat-perro",
        priceKgSuelto: 7000,
        priceKgSueltoManual: false,
      },
    ], [
      { id: "c2", brandId: "b-proplan", typeId: "t-mediana", species: "PERRO", priceKg: 8200 },
    ]);

    const result = await autoApply(tx, "org-1");

    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(tx.reviewQueueEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productId: "p3",
          reason: "FUZZY_MATCH",
          newPriceKg: 8200,
        }),
      }),
    );
    expect(result.queued).toBe(1);
    expect(result.applied).toBe(0);
  });

  it("marca sin celda de planilla para el combo → BRAND_NO_PLANILLA", async () => {
    const tx = setup(mockTx(), [
      {
        id: "p4",
        name: "BALANCE ADULTO PERRO 14KG",
        categoryId: "cat-perro",
        priceKgSuelto: 5000,
        priceKgSueltoManual: false,
      },
    ], []); // ninguna celda de Balance

    const result = await autoApply(tx, "org-1");

    expect(tx.reviewQueueEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productId: "p4",
          reason: "BRAND_NO_PLANILLA",
          newPriceKg: null,
        }),
      }),
    );
    expect(result.queued).toBe(1);
    expect(result.applied).toBe(0);
  });

  it("celda huérfana sin producto matcheado → ORPHAN_CELL (productId null)", async () => {
    const tx = setup(mockTx(), [
      {
        id: "p5",
        name: "OTRA MARCA ADULTO PERRO 10KG",
        categoryId: "cat-perro",
        priceKgSuelto: null,
        priceKgSueltoManual: false,
      },
    ], [
      { id: "c3", brandId: "b-royal", typeId: "t-adulto", species: "PERRO", priceKg: 9800 },
    ]);

    const result = await autoApply(tx, "org-1");

    expect(tx.reviewQueueEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productId: null,
          priceKgPriceId: "c3",
          reason: "ORPHAN_CELL",
          newPriceKg: 9800,
        }),
      }),
    );
    // El producto "OTRA MARCA" también cae a revisión (tiene etapa pero la
    // marca no tiene planilla): 1 huérfana + 1 marca sin planilla = 2.
    expect(tx.reviewQueueEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productId: "p5",
          reason: "BRAND_NO_PLANILLA",
        }),
      }),
    );
    expect(result.queued).toBe(2);
  });
});

// FASE 4 — test del módulo de consulta de catálogo para el bot de WhatsApp.
//
// whatsappCatalog consulta la DB (precios REALES, no inventa). Como no hay BD en
// local, mockeamos `../config/db` y controlamos qué devuelve cada query. Los
// helpers puros (formato/species/parseDecimal) no tocan prisma → se testean
// directo.

jest.mock("../../src/config/db", () => ({
  prisma: {
    product: { findFirst: jest.fn(), findMany: jest.fn() },
    priceKgPrice: { findFirst: jest.fn(), findMany: jest.fn() },
    priceKgType: { findMany: jest.fn(), findFirst: jest.fn() },
    priceKgBrand: { findMany: jest.fn(), findFirst: jest.fn() },
    category: { findMany: jest.fn() },
    looseStock: { findMany: jest.fn() },
  },
  basePrisma: {},
}));

import { prisma } from "../../src/config/db";
import {
  listSpecies,
  listStages,
  matchStages,
  listBrands,
  matchBrands,
  listProductsForSelection,
  resolveProductById,
  calculateOrderCost,
  normalizeSpeciesAnswer,
  parseDecimal,
  formatMoney,
  formatQty,
} from "../../src/services/whatsappCatalog";

// Referencias a los mocks de prisma (tras el import, sin TDZ).
const mockProductFindFirst = prisma.product.findFirst as jest.Mock;
const mockProductFindMany = prisma.product.findMany as jest.Mock;
const mockPriceKgFindFirst = prisma.priceKgPrice.findFirst as jest.Mock;
const mockPriceKgFindMany = prisma.priceKgPrice.findMany as jest.Mock;
const mockTypeFindMany = prisma.priceKgType.findMany as jest.Mock;
const mockBrandFindMany = prisma.priceKgBrand.findMany as jest.Mock;
const mockCategoryFindMany = prisma.category.findMany as jest.Mock;
const mockLooseFindMany = prisma.looseStock.findMany as jest.Mock;

const catRoot = { id: "alimento", name: "Alimento Seco", parentId: null };
const catPerro = { id: "perro", name: "Perro", parentId: "alimento" };

const resetMocks = (): void => {
  jest.clearAllMocks();
  // Defaults inocuos: findFirst de celda/producto → sin resultado.
  mockProductFindFirst.mockResolvedValue(null);
  mockPriceKgFindFirst.mockResolvedValue(null);
  mockPriceKgFindMany.mockResolvedValue([]);
  mockTypeFindMany.mockResolvedValue([]);
  mockBrandFindMany.mockResolvedValue([]);
  mockCategoryFindMany.mockResolvedValue([]);
  mockLooseFindMany.mockResolvedValue([]);
};

describe("whatsappCatalog — helpers puros (sin prisma)", () => {
  it("normalizeSpeciesAnswer: palabra, número y id", () => {
    expect(normalizeSpeciesAnswer("perro")).toBe("perro");
    expect(normalizeSpeciesAnswer("1")).toBe("perro");
    expect(normalizeSpeciesAnswer("gato")).toBe("gato");
    expect(normalizeSpeciesAnswer("2")).toBe("gato");
    expect(normalizeSpeciesAnswer("ave")).toBeNull();
  });

  it("parseDecimal: número válido (>0) y texto inválido", () => {
    expect(parseDecimal("1.5")).toBe(1.5);
    expect(parseDecimal("2")).toBe(2);
    expect(parseDecimal("0")).toBeNull();
    expect(parseDecimal("abc")).toBeNull();
  });

  it("formatMoney sin decimales al final (45000 → '45000', 45000.5 → '45000.5')", () => {
    expect(formatMoney(45000)).toBe("45000");
    expect(formatMoney(45000.5)).toBe("45000.5");
    expect(formatMoney(1234567)).toBe("1234567");
  });

  it("formatQty sin ceros al final (2 → '2', 1.5 → '1.5')", () => {
    expect(formatQty(2)).toBe("2");
    expect(formatQty(1.5)).toBe("1.5");
  });
});

describe("whatsappCatalog — listSpecies", () => {
  beforeEach(resetMocks);

  it("deriva perro/gato de especies ± AMBOS de tipos y marcas", async () => {
    mockTypeFindMany.mockResolvedValue([{ species: "PERRO" }, { species: "AMBOS" }]);
    mockBrandFindMany.mockResolvedValue([{ species: "GATO" }, { species: "AMBOS" }]);
    await expect(listSpecies()).resolves.toEqual(["perro", "gato"]);
  });

  it("devuelve solo la especie que tiene data", async () => {
    mockTypeFindMany.mockResolvedValue([{ species: "PERRO" }]);
    mockBrandFindMany.mockResolvedValue([]);
    await expect(listSpecies()).resolves.toEqual(["perro"]);
  });
});

describe("whatsappCatalog — listStages", () => {
  beforeEach(resetMocks);

  it("mapea PriceKgType a {stage, id}", async () => {
    mockTypeFindMany.mockResolvedValue([
      { id: "t-adulto", name: "Adulto" },
      { id: "t-cachorro", name: "Cachorro" },
    ]);
    await expect(listStages("perro")).resolves.toEqual([
      { stage: "Adulto", id: "t-adulto" },
      { stage: "Cachorro", id: "t-cachorro" },
    ]);
  });
});

describe("whatsappCatalog — listBrands", () => {
  beforeEach(resetMocks);

  it("filtrar marcas con celdas para especie+etapa", async () => {
    mockPriceKgFindMany.mockResolvedValue([{ brandId: "b1" }, { brandId: "b2" }]);
    mockBrandFindMany.mockResolvedValue([
      { id: "b1", name: "Pro Plan" },
      { id: "b2", name: "Maxxium" },
    ]);
    await expect(listBrands("perro", "t-adulto")).resolves.toEqual([
      { brand: "Pro Plan", id: "b1" },
      { brand: "Maxxium", id: "b2" },
    ]);
  });

  it("sin celdas → array vacío", async () => {
    mockPriceKgFindMany.mockResolvedValue([]);
    await expect(listBrands("perro", "t-adulto")).resolves.toEqual([]);
  });
});

describe("whatsappCatalog — listProductsForSelection", () => {
  beforeEach(resetMocks);

  it("devuelve la celda de kilo + las bolsas que clasifican a marca+etapa+especie", async () => {
    // Celda de kilo.
    mockPriceKgFindFirst.mockResolvedValue({ id: "c-1", priceKg: 30000 });
    (prisma.priceKgBrand.findFirst as jest.Mock).mockResolvedValue({
      name: "Pro Plan",
    });
    (prisma.priceKgType.findFirst as jest.Mock).mockResolvedValue({ name: "Adulto" });

    // Datos para clasificar bolsas.
    mockCategoryFindMany.mockResolvedValue([catRoot, catPerro]);
    mockBrandFindMany.mockResolvedValue([
      { id: "b-proplan", name: "Pro Plan", keywords: ["PROPLAN"] },
    ]);
    mockTypeFindMany.mockResolvedValue([
      { id: "t-adulto", name: "Adulto", synonyms: ["ADULT"] },
    ]);
    mockProductFindMany.mockResolvedValue([
      {
        id: "p-1",
        name: "Pro Plan Adulto 15kg",
        price: 45000,
        priceKgSuelto: null,
        categoryId: "perro",
      },
    ]);

    const products = await listProductsForSelection("perro", "t-adulto", "b-proplan");
    expect(products).toEqual([
      { type: "kilo", id: "c-1", label: "Pro Plan Adulto suelto", price: 30000, priceKg: 30000 },
      { type: "bolsa", id: "p-1", label: "Pro Plan Adulto 15kg", price: 45000, priceKg: null },
    ]);
  });

  it("sin celda ni producto → array vacío", async () => {
    mockPriceKgFindFirst.mockResolvedValue(null);
    mockCategoryFindMany.mockResolvedValue([]);
    mockProductFindMany.mockResolvedValue([]);
    await expect(listProductsForSelection("perro", "t-adulto", "b")).resolves.toEqual([]);
  });
});

describe("whatsappCatalog — resolveProductById", () => {
  beforeEach(resetMocks);

  it("bolsa: resuelve Product por id (price + cantidad)", async () => {
    mockProductFindFirst.mockResolvedValue({
      id: "p-1",
      name: "Pro Plan Adulto 15kg",
      price: 45000,
      priceKgSuelto: 2900.5,
      quantity: 20,
    });
    await expect(resolveProductById("p-1")).resolves.toEqual({
      type: "bolsa",
      name: "Pro Plan Adulto 15kg",
      price: 45000,
      priceKg: 2900.5,
      stock: 20,
    });
  });

  it("kilo: resuelve la celda + stock suelto sumado entre sucursales", async () => {
    mockProductFindFirst.mockResolvedValue(null);
    mockPriceKgFindFirst.mockResolvedValue({
      id: "c-1",
      priceKg: 30000,
      brandId: "b-proplan",
      typeId: "t-adulto",
    });
    (prisma.priceKgBrand.findFirst as jest.Mock).mockResolvedValue({ name: "Pro Plan" });
    (prisma.priceKgType.findFirst as jest.Mock).mockResolvedValue({ name: "Adulto" });
    mockLooseFindMany.mockResolvedValue([{ quantity: 2 }, { quantity: 0.5 }]);
    await expect(resolveProductById("c-1")).resolves.toEqual({
      type: "kilo",
      name: "Pro Plan Adulto suelto",
      price: 30000,
      priceKg: 30000,
      stock: 2.5,
    });
  });

  it("id desconocido → null", async () => {
    mockProductFindFirst.mockResolvedValue(null);
    mockPriceKgFindFirst.mockResolvedValue(null);
    await expect(resolveProductById("zzz")).resolves.toBeNull();
  });
});

describe("whatsappCatalog — calculateOrderCost (round2, sin inventar)", () => {
  beforeEach(resetMocks);

  it("bolsa: 2 × 45000 = 90000", async () => {
    mockProductFindFirst.mockResolvedValue({
      id: "p-1",
      name: "Pro Plan Adulto 15kg",
      price: 45000,
      priceKgSuelto: null,
      quantity: 20,
    });
    await expect(
      calculateOrderCost({ type: "bolsa", id: "p-1", quantity: 2 }),
    ).resolves.toEqual({
      total: 90000,
      detail: "2 × Pro Plan Adulto 15kg @ $45000 = $90000",
    });
  });

  it("kilo: 1.5 × 30000 = 45000", async () => {
    mockProductFindFirst.mockResolvedValue(null);
    mockPriceKgFindFirst.mockResolvedValue({
      id: "c-1",
      priceKg: 30000,
      brandId: "b-proplan",
      typeId: "t-adulto",
    });
    (prisma.priceKgBrand.findFirst as jest.Mock).mockResolvedValue({ name: "Pro Plan" });
    (prisma.priceKgType.findFirst as jest.Mock).mockResolvedValue({ name: "Adulto" });
    mockLooseFindMany.mockResolvedValue([]);
    await expect(
      calculateOrderCost({ type: "kilo", id: "c-1", quantity: 1.5 }),
    ).resolves.toEqual({
      total: 45000,
      detail: "1.5 kg @ $30000/kg = $45000",
    });
  });

  it("monto: el total es el importe directo", async () => {
    await expect(
      calculateOrderCost({ type: "monto", id: "", amount: 50000 }),
    ).resolves.toEqual({ total: 50000, detail: "$50000" });
  });

  it("bolsa con precio en cero (sin precio) → lo dice honestamente", async () => {
    mockProductFindFirst.mockResolvedValue({
      id: "p-1",
      name: "Sin precio",
      price: 0,
      priceKgSuelto: null,
      quantity: 5,
    });
    await expect(
      calculateOrderCost({ type: "bolsa", id: "p-1", quantity: 1 }),
    ).resolves.toEqual({ total: 0, detail: "Todavía no tenemos precio cargado para eso." });
  });

  it("producto inexistente → dice que no lo encuentra", async () => {
    await expect(
      calculateOrderCost({ type: "bolsa", id: "zzz", quantity: 1 }),
    ).resolves.toEqual({
      total: 0,
      detail: "No encontramos ese producto en el catálogo. Debería estar cargado.",
    });
  });
});

describe("whatsappCatalog — matchBrands (FASE 4: marca por texto libre)", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("matchea por keyword exacto → exact:true", async () => {
    // listBrands: priceKgPrice.findMany → 1 celda → brandId "b1"; luego
    // priceKgBrand.findMany (para listBrands) → devuelve la marca.
    mockPriceKgFindMany.mockResolvedValue([{ brandId: "b1" }]);
    mockBrandFindMany
      .mockResolvedValueOnce([
        { id: "b1", name: "ProPlan", keywords: [] },
        { id: "b2", name: "Old Prince", keywords: [] },
      ])
      // Segundo findMany (en matchBrands, para keywords).
      .mockResolvedValueOnce([
        { id: "b1", name: "ProPlan", keywords: ["pro plan", "purina"] },
        { id: "b2", name: "Old Prince", keywords: ["old prince", "royal"] },
      ]);

    await expect(matchBrands("perro", "t-adulto", "purina")).resolves.toEqual([
      { brand: "ProPlan", id: "b1", exact: true },
    ]);
  });

  it("texto parcial (varias candidatas) → sin exact, hasta 3", async () => {
    mockPriceKgFindMany.mockResolvedValue([{ brandId: "b1" }, { brandId: "b2" }, { brandId: "b3" }]);
    mockBrandFindMany
      .mockResolvedValueOnce([
        { id: "b1", name: "AGILITY", keywords: [] },
        { id: "b2", name: "AGILITY CORDERO", keywords: [] },
        { id: "b3", name: "AGILITY SALMON", keywords: [] },
      ])
      .mockResolvedValueOnce([
        { id: "b1", name: "AGILITY", keywords: [] },
        { id: "b2", name: "AGILITY CORDERO", keywords: [] },
        { id: "b3", name: "AGILITY SALMON", keywords: [] },
      ]);

    const res = await matchBrands("perro", "t-adulto", "agility");
    expect(res.length).toBe(3);
    expect(res.every((r) => r.exact === false)).toBe(true);
  });

  it("sin match → devuelve []", async () => {
    mockPriceKgFindMany.mockResolvedValue([{ brandId: "b1" }]);
    mockBrandFindMany
      .mockResolvedValueOnce([{ id: "b1", name: "ProPlan", keywords: [] }])
      .mockResolvedValueOnce([{ id: "b1", name: "ProPlan", keywords: [] }]);

    await expect(matchBrands("perro", "t-adulto", "marca-inexistente")).resolves.toEqual([]);
  });
});

describe("whatsappCatalog — matchStages (FASE 4: etapa por texto libre)", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("matchea por nombre exacto → exact:true", async () => {
    mockTypeFindMany.mockResolvedValue([
      { id: "t-adulto", name: "Adulto", species: "PERRO", synonyms: [] },
      { id: "t-cachorro", name: "Cachorro", species: "PERRO", synonyms: [] },
    ]);

    await expect(matchStages("perro", "Adulto")).resolves.toEqual([
      { stage: "Adulto", id: "t-adulto", exact: true },
    ]);
  });

  it("matchea por sinónimo → exact:true", async () => {
    mockTypeFindMany.mockResolvedValue([
      { id: "t-adulto", name: "Adulto", species: "PERRO", synonyms: ["adult"] },
      { id: "t-kitten", name: "Kitten", species: "GATO", synonyms: ["gatito"] },
    ]);

    await expect(matchStages("perro", "adult")).resolves.toEqual([
      { stage: "Adulto", id: "t-adulto", exact: true },
    ]);
  });

  it("sin match → devuelve []", async () => {
    mockTypeFindMany.mockResolvedValue([
      { id: "t-adulto", name: "Adulto", species: "PERRO", synonyms: [] },
    ]);

    await expect(matchStages("perro", "geriatrico")).resolves.toEqual([]);
  });
});

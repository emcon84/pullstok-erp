// FASE 4 — test del módulo de consulta de catálogo para el bot de WhatsApp.
//
// Antes mockeamos `../config/db` porque el módulo consultaba la DB. Ahora
// (snapshot en memoria, FASE 4.5) las lecturas pasan por whatsappCatalogCache:
// todo el catálogo se carga UNA vez (pre-clasificado) y acá solo se filtra. Por
// eso mockeamos EL CACHE (getCatalogSnapshot y los getters) y le inyectamos un
// snapshot de prueba fijo. La única query a DB que queda en el módulo es la de
// STOCK puntual (resolveProductById) → mockeamos prisma.product.findFirst y
// prisma.looseStock.findMany para esos casos.
// Los helpers puros (formato/species/parseDecimal) no tocan nada → directo.

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

// El cache se mockea completo: los getters y getCatalogSnapshot devuelven lo que
// el snapshot de prueba defina. La lógica que testeamos es la del módulo.
jest.mock("../../src/services/whatsappCatalogCache");

import { prisma } from "../../src/config/db";
import * as catalogCache from "../../src/services/whatsappCatalogCache";
import {
  listSpecies,
  listStages,
  matchStages,
  listBrands,
  matchBrands,
  listProductsForSelection,
  resolveProductById,
  calculateOrderCost,
  matchProductForDraft,
  normalizeSpeciesAnswer,
  parseDecimal,
  formatMoney,
  formatQty,
} from "../../src/services/whatsappCatalog";

type Mock<T> = jest.Mock<Promise<T>, any[]>;
const mockGetCatalogSnapshot = catalogCache.getCatalogSnapshot as Mock<any>;
const mockGetSpecies = catalogCache.getSpecies as Mock<any>;
const mockGetStages = catalogCache.getStages as Mock<any>;
const mockGetBrands = catalogCache.getBrands as Mock<any>;
const mockGetProductsFor = catalogCache.getProductsFor as Mock<any>;
const mockFindCell = catalogCache.findCell as Mock<any>;
const mockFindCellById = catalogCache.findCellById as Mock<any>;
const mockFindProductById = catalogCache.findProductById as Mock<any>;
const mockGetCellLabel = catalogCache.getCellLabel as Mock<any>;

const mockProductFindFirst = prisma.product.findFirst as jest.Mock;
const mockLooseFindMany = prisma.looseStock.findMany as jest.Mock;

// Snapshot de prueba: lo que el cache ya precargó (pre-clasificado).
const snapshot = {
  categories: [
    { id: "alimento", name: "Alimento Seco", parentId: null },
    { id: "perro", name: "Perro", parentId: "alimento" },
  ],
  brands: [
    { id: "b-proplan", name: "ProPlan", keywords: ["pro plan", "purina"], species: ["perro"] },
    { id: "b-agility", name: "AGILITY", keywords: [], species: ["perro"] },
    { id: "b-agility-cordero", name: "AGILITY CORDERO", keywords: [], species: ["perro"] },
    { id: "b-agility-salmon", name: "AGILITY SALMON", keywords: [], species: ["perro"] },
  ],
  stages: [
    { id: "t-adulto", name: "Adulto", synonyms: ["adult"], species: ["perro"], sortOrder: 10 },
    { id: "t-cachorro", name: "Cachorro", synonyms: [], species: ["perro"], sortOrder: 20 },
  ],
  cells: [
    { id: "c-1", brandId: "b-proplan", typeId: "t-adulto", species: "perro", priceKg: 30000 },
  ],
  products: [
    {
      id: "p-1",
      name: "Pro Plan Adulto 15kg",
      price: 45000,
      priceKgSuelto: 2900.5,
      categoryId: "perro",
      species: "perro",
      brandId: "b-proplan",
      typeId: "t-adulto",
    },
  ],
  secoCategoryIds: ["alimento", "perro"],
};

const resetMocks = (): void => {
  jest.clearAllMocks();
  // Defaults inocuos para que un test suelto no explote.
  mockGetCatalogSnapshot.mockResolvedValue(snapshot);
  mockGetSpecies.mockResolvedValue(["perro", "gato"]);
  mockGetStages.mockResolvedValue([]);
  mockGetBrands.mockResolvedValue([]);
  mockGetProductsFor.mockResolvedValue([]);
  mockFindCell.mockResolvedValue(null);
  mockFindCellById.mockResolvedValue(null);
  mockFindProductById.mockResolvedValue(null);
  mockGetCellLabel.mockResolvedValue("Pro Plan Adulto suelto");
  mockProductFindFirst.mockResolvedValue(null);
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

  it("delega en el snapshot", async () => {
    mockGetSpecies.mockResolvedValue(["perro"]);
    await expect(listSpecies()).resolves.toEqual(["perro"]);
  });
});

describe("whatsappCatalog — listStages", () => {
  beforeEach(resetMocks);

  it("mapea etapas del snapshot a {stage, id}", async () => {
    mockGetStages.mockResolvedValue([
      { stage: "Adulto", id: "t-adulto" },
      { stage: "Cachorro", id: "t-cachorro" },
    ]);
    await expect(listStages("perro")).resolves.toEqual([
      { stage: "Adulto", id: "t-adulto" },
      { stage: "Cachorro", id: "t-cachorro" },
    ]);
  });
});

describe("whatsappCatalog — listBrands", () => {
  beforeEach(resetMocks);

  it("delega en el snapshot (marcas con celda para especie+etapa)", async () => {
    mockGetBrands.mockResolvedValue([
      { brand: "Pro Plan", id: "b1" },
      { brand: "Maxxium", id: "b2" },
    ]);
    await expect(listBrands("perro", "t-adulto")).resolves.toEqual([
      { brand: "Pro Plan", id: "b1" },
      { brand: "Maxxium", id: "b2" },
    ]);
  });

  it("sin celdas → array vacío", async () => {
    mockGetBrands.mockResolvedValue([]);
    await expect(listBrands("perro", "t-adulto")).resolves.toEqual([]);
  });
});

describe("whatsappCatalog — listProductsForSelection", () => {
  beforeEach(resetMocks);

  it("devuelve la celda de kilo + las bolsas pre-clasificadas del snapshot", async () => {
    mockFindCell.mockResolvedValue({ id: "c-1", brandId: "b-proplan", typeId: "t-adulto", species: "perro", priceKg: 30000 });
    mockGetCellLabel.mockResolvedValue("Pro Plan Adulto suelto");
    mockGetProductsFor.mockResolvedValue([
      { type: "bolsa", id: "p-1", label: "Pro Plan Adulto 15kg", price: 45000, priceKg: 2900.5 },
    ]);

    const products = await listProductsForSelection("perro", "b-proplan", "t-adulto");
    expect(products).toEqual([
      { type: "kilo", id: "c-1", label: "Pro Plan Adulto suelto", price: 30000, priceKg: 30000 },
      { type: "bolsa", id: "p-1", label: "Pro Plan Adulto 15kg", price: 45000, priceKg: 2900.5 },
    ]);
  });

  it("sin celda ni producto → array vacío", async () => {
    mockFindCell.mockResolvedValue(null);
    mockGetProductsFor.mockResolvedValue([]);
    await expect(listProductsForSelection("perro", "b", "t-adulto")).resolves.toEqual([]);
  });
});

describe("whatsappCatalog — resolveProductById", () => {
  beforeEach(resetMocks);

  it("bolsa: precio del snapshot + stock puntual de la DB", async () => {
    mockFindProductById.mockResolvedValue(snapshot.products[0]);
    mockProductFindFirst.mockResolvedValue({ quantity: 20 });
    await expect(resolveProductById("p-1")).resolves.toEqual({
      type: "bolsa",
      name: "Pro Plan Adulto 15kg",
      price: 45000,
      priceKg: 2900.5,
      stock: 20,
    });
  });

  it("kilo: resuelve la celda + stock suelto sumado entre sucursales", async () => {
    mockFindProductById.mockResolvedValue(null);
    mockFindCellById.mockResolvedValue({ id: "c-1", brandId: "b-proplan", typeId: "t-adulto", species: "perro", priceKg: 30000 });
    mockGetCellLabel.mockResolvedValue("Pro Plan Adulto suelto");
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
    mockFindProductById.mockResolvedValue(null);
    mockFindCellById.mockResolvedValue(null);
    await expect(resolveProductById("zzz")).resolves.toBeNull();
  });
});

describe("whatsappCatalog — calculateOrderCost (round2, sin inventar)", () => {
  beforeEach(resetMocks);

  it("bolsa: 2 × 45000 = 90000", async () => {
    mockFindProductById.mockResolvedValue({ ...snapshot.products[0], price: 45000, priceKgSuelto: null });
    mockProductFindFirst.mockResolvedValue({ quantity: 20 });
    await expect(
      calculateOrderCost({ type: "bolsa", id: "p-1", quantity: 2 }),
    ).resolves.toEqual({
      total: 90000,
      detail: "2 × Pro Plan Adulto 15kg @ $45000 = $90000",
    });
  });

  it("kilo: 1.5 × 30000 = 45000", async () => {
    mockFindProductById.mockResolvedValue(null);
    mockFindCellById.mockResolvedValue({ id: "c-1", brandId: "b-proplan", typeId: "t-adulto", species: "perro", priceKg: 30000 });
    mockGetCellLabel.mockResolvedValue("Pro Plan Adulto suelto");
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
    mockFindProductById.mockResolvedValue({ ...snapshot.products[0], name: "Sin precio", price: 0, priceKgSuelto: null });
    mockProductFindFirst.mockResolvedValue({ quantity: 5 });
    await expect(
      calculateOrderCost({ type: "bolsa", id: "p-1", quantity: 1 }),
    ).resolves.toEqual({ total: 0, detail: "Todavía no tenemos precio cargado para eso." });
  });

  it("producto inexistente → dice que no lo encuentra", async () => {
    mockFindProductById.mockResolvedValue(null);
    mockFindCellById.mockResolvedValue(null);
    await expect(
      calculateOrderCost({ type: "bolsa", id: "zzz", quantity: 1 }),
    ).resolves.toEqual({
      total: 0,
      detail: "No encontramos ese producto en el catálogo. Debería estar cargado.",
    });
  });
});

describe("whatsappCatalog — matchBrands (FASE 4: marca por texto libre)", () => {
  beforeEach(resetMocks);

  it("matchea por keyword exacto → exact:true", async () => {
    mockGetCatalogSnapshot.mockResolvedValue(snapshot);
    await expect(matchBrands("perro", "purina")).resolves.toEqual([
      { brand: "ProPlan", id: "b-proplan", exact: true },
    ]);
  });

  it("texto parcial (varias candidatas) → sin exact, hasta 3", async () => {
    mockGetCatalogSnapshot.mockResolvedValue(snapshot);

    const res = await matchBrands("perro", "agility");
    expect(res.length).toBe(3);
    expect(res.every((r) => r.exact === false)).toBe(true);
  });

  it("sin match → devuelve []", async () => {
    mockGetCatalogSnapshot.mockResolvedValue(snapshot);
    await expect(matchBrands("perro", "marca-inexistente")).resolves.toEqual([]);
  });
});

describe("whatsappCatalog — matchStages (FASE 4: etapa por texto libre)", () => {
  beforeEach(resetMocks);

  it("matchea por nombre exacto → exact:true", async () => {
    mockGetCatalogSnapshot.mockResolvedValue(snapshot);
    await expect(matchStages("perro", "Adulto")).resolves.toEqual([
      { stage: "Adulto", id: "t-adulto", exact: true },
    ]);
  });

  it("matchea por sinónimo → exact:true", async () => {
    mockGetCatalogSnapshot.mockResolvedValue(snapshot);
    await expect(matchStages("perro", "adult")).resolves.toEqual([
      { stage: "Adulto", id: "t-adulto", exact: true },
    ]);
  });

  it("sin match → devuelve []", async () => {
    mockGetCatalogSnapshot.mockResolvedValue(snapshot);
    await expect(matchStages("perro", "geriatrico")).resolves.toEqual([]);
  });
});

describe("whatsappCatalog — matchProductForDraft (FASE 6: atributos → producto)", () => {
  beforeEach(resetMocks);

  it("bolsa con peso que matchea el nombre → devuelve el producto", async () => {
    mockGetCatalogSnapshot.mockResolvedValue(snapshot);
    mockFindCell.mockResolvedValue(null);
    mockGetProductsFor.mockResolvedValue([
      {
        type: "bolsa",
        id: "p-1",
        label: "Pro Plan Adulto 15kg",
        price: 45000,
        priceKg: null,
      },
    ]);

    const res = await matchProductForDraft({
      species: "perro",
      brandId: "b-proplan",
      stageId: "t-adulto",
      sizeText: "15 kg",
      orderType: "bolsa",
    });
    expect(res).toEqual({
      id: "p-1",
      type: "bolsa",
      name: "Pro Plan Adulto 15kg",
      price: 45000,
    });
  });

  it("bolsa con peso que NO matchea → null (queda como requerimiento)", async () => {
    mockGetCatalogSnapshot.mockResolvedValue(snapshot);
    mockFindCell.mockResolvedValue(null);
    mockGetProductsFor.mockResolvedValue([
      {
        type: "bolsa",
        id: "p-1",
        label: "Pro Plan Adulto 15kg",
        price: 45000,
        priceKg: null,
      },
    ]);

    const res = await matchProductForDraft({
      species: "perro",
      brandId: "b-proplan",
      stageId: "t-adulto",
      sizeText: "10 kg",
      orderType: "bolsa",
    });
    expect(res).toBeNull();
  });

  it("kilo: prefiere la celda suelta (precio autoritativo)", async () => {
    mockGetCatalogSnapshot.mockResolvedValue(snapshot);
    mockFindCell.mockResolvedValue({
      id: "c-1",
      brandId: "b-proplan",
      typeId: "t-adulto",
      species: "perro",
      priceKg: 30000,
    });
    mockGetCellLabel.mockResolvedValue("Pro Plan Adulto suelto");

    const res = await matchProductForDraft({
      species: "perro",
      brandId: "b-proplan",
      stageId: "t-adulto",
      orderType: "kilo",
    });
    expect(res).toEqual({
      id: "c-1",
      type: "kilo",
      name: "Pro Plan Adulto suelto",
      price: 30000,
    });
  });
});

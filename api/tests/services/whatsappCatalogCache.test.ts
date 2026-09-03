// Test del snapshot en memoria del catálogo de WhatsApp.
//
// Este módulo lee la DB con basePrisma (where explícito por org) y guarda un
// snapshot con TTL. Mockeamos `../config/db` y controlamos qué devuelve cada
// query de basePrisma para testear:
// - que getCatalogSnapshot CACHEA (no recarga si no expiró) y RECARGA si pasa TTL;
// - que los getters (getStages/getBrands/getProductsFor/findCell/...) filtran
//   bien sobre el snapshot pre-clasificado;
// - la pre-clasificación: los products.products[] carry la especie/marca/etapa
//   resueltas por classifyProduct (el snapshot resuelve UNA vez, no por mensaje).

jest.mock("../../src/config/db", () => ({
  basePrisma: {
    organization: { findFirst: jest.fn() },
    category: { findMany: jest.fn() },
    priceKgBrand: { findMany: jest.fn() },
    priceKgType: { findMany: jest.fn() },
    priceKgPrice: { findMany: jest.fn() },
    product: { findMany: jest.fn() },
  },
  prisma: {},
}));

import { basePrisma } from "../../src/config/db";
import {
  getCatalogSnapshot,
  invalidateCatalogCache,
  refreshCatalogCache,
  getSpecies,
  getStages,
  getBrands,
  getProductsFor,
  findCell,
  findCellById,
  findProductById,
  getCellLabel,
} from "../../src/services/whatsappCatalogCache";

const mockOrgFindFirst = basePrisma.organization.findFirst as jest.Mock;
const mockCategoryFindMany = basePrisma.category.findMany as jest.Mock;
const mockBrandFindMany = basePrisma.priceKgBrand.findMany as jest.Mock;
const mockTypeFindMany = basePrisma.priceKgType.findMany as jest.Mock;
const mockCellFindMany = basePrisma.priceKgPrice.findMany as jest.Mock;
const mockProductFindMany = basePrisma.product.findMany as jest.Mock;

// ── Fixture de la org "demo": categorías, marcas, tipos, celdas y productos ──

const setDemoData = (): void => {
  mockOrgFindFirst.mockResolvedValue({ id: "org-demo" });

  mockCategoryFindMany.mockResolvedValue([
    { id: "alimento", name: "Alimento Seco", parentId: null },
    { id: "perro", name: "Perro", parentId: "alimento" },
  ]);

  mockBrandFindMany.mockResolvedValue([
    { id: "b-proplan", name: "Pro Plan", keywords: ["PROPLAN", "purina"], species: "PERRO" },
    { id: "b-maxxium", name: "Maxxium", keywords: ["MAXXIUM"], species: "PERRO" },
    { id: "b-oldprince", name: "Old Prince", keywords: ["old prince"], species: "AMBOS" },
  ]);

  mockTypeFindMany.mockResolvedValue([
    { id: "t-adulto", name: "Adulto", synonyms: ["adult"], species: "PERRO", sortOrder: 10 },
    { id: "t-cachorro", name: "Cachorro", synonyms: ["kitten"], species: "AMBOS", sortOrder: 20 },
  ]);

  mockCellFindMany.mockResolvedValue([
    { id: "c-adulto-proplan", brandId: "b-proplan", typeId: "t-adulto", species: "PERRO", priceKg: 30000 },
    { id: "c-adulto-maxxium", brandId: "b-maxxium", typeId: "t-adulto", species: "PERRO", priceKg: 25000 },
  ]);

  // Productos de bolsa: pre-clasificados por loadSnapshot (classifyProduct).
  // "Pro Plan Adulto 15kg" → marca Pro Plan, etapa Adulto, especie Perro.
  // "Maxxium Cachorro 10kg" → Maxxium, Cachorro (type AMBOS).
  mockProductFindMany.mockResolvedValue([
    {
      id: "p-1",
      name: "Pro Plan Adulto 15kg",
      price: 45000,
      priceKgSuelto: null,
      categoryId: "perro",
    },
    {
      id: "p-2",
      name: "Maxxium Cachorro 10kg",
      price: 39000,
      priceKgSuelto: 2900.5,
      categoryId: "perro",
    },
  ]);
};

const resetMocks = (): void => {
  jest.clearAllMocks();
};

beforeEach(() => {
  resetMocks();
  invalidateCatalogCache();
  process.env.KAPSO_ORG_SLUG = "demo";
  // TTL grande por defecto: cachea estable durante un test.
  process.env.KAPSO_CATALOG_TTL_MS = "600000";
});

describe("whatsappCatalogCache — carga y cacheo (TTL)", () => {
  it("getCatalogSnapshot carga desde la DB y DEVUELVE el mismo objeto si no expiró", async () => {
    setDemoData();

    const first = await getCatalogSnapshot();
    const second = await getCatalogSnapshot();

    expect(second).toBe(first); // el mismo objeto cacheado, no re-consulta
    expect(mockProductFindMany).toHaveBeenCalledTimes(1);
    expect(mockCategoryFindMany).toHaveBeenCalledTimes(1);
  });

  it("pre-clasifica productos con classifyProduct: species/brandId/typeId resueltos", async () => {
    setDemoData();

    const snap = await getCatalogSnapshot();

    // "Pro Plan Adulto 15kg" clasifica a Pro Plan (b-proplan) + Adulto (t-adulto) + perro.
    const p1 = snap.products.find((p) => p.id === "p-1");
    expect(p1).toMatchObject({
      species: "perro",
      brandId: "b-proplan",
      typeId: "t-adulto",
    });
    // "Maxxium Cachorro 10kg" → Maxxium + Cachorro + perro.
    const p2 = snap.products.find((p) => p.id === "p-2");
    expect(p2).toMatchObject({ species: "perro", brandId: "b-maxxium", typeId: "t-cachorro" });
  });

  it("recarga el snapshot cuando pasa el TTL", async () => {
    setDemoData();

    // TTL mínimo para que el próximo get expire casi seguro.
    process.env.KAPSO_CATALOG_TTL_MS = "1";
    await getCatalogSnapshot();
    expect(mockProductFindMany).toHaveBeenCalledTimes(1);

    // Esperamos unos ms para que Date.now() avance más que el TTL (1ms).
    await new Promise((r) => setTimeout(r, 5));
    await getCatalogSnapshot();
    expect(mockProductFindMany).toHaveBeenCalledTimes(2);
  });

  it("invalidar fuerza recarga en frío (no devuelve el snapshot previo)", async () => {
    setDemoData();
    await getCatalogSnapshot();
    expect(mockProductFindMany).toHaveBeenCalledTimes(1);

    invalidateCatalogCache();
    await getCatalogSnapshot();
    expect(mockProductFindMany).toHaveBeenCalledTimes(2);
  });

  it("refreshCatalogCache invalida y recarga una sola vez", async () => {
    setDemoData();
    await refreshCatalogCache();
    expect(mockProductFindMany).toHaveBeenCalledTimes(1);
  });
});

describe("whatsappCatalogCache — getters sobre el snapshot", () => {
  beforeEach(() => {
    setDemoData();
  });

  it("getSpecies deriva perro/gato de etapas y marcas (± AMBOS)", async () => {
    // t-cachorro AMBOS + b-oldprince AMBOS → ambas especies.
    await expect(getSpecies()).resolves.toEqual(["perro", "gato"]);
  });

  it("getStages filtra por especie y ordena por sortOrder", async () => {
    const stages = await getStages("perro");
    expect(stages).toEqual([
      { stage: "Adulto", id: "t-adulto" },
      { stage: "Cachorro", id: "t-cachorro" },
    ]);
  });

  it("getStages de una especie sin data → []", async () => {
    // La org demo no tiene planilla de gatos propia; AMBOS da "gato", pero si la
    // query de tipos devolviera solo PERRO/AMBOS igual aplica. Verificamos el
    // caso de una especie sin etapas forzando un snapshot vacío.
    invalidateCatalogCache();
    mockTypeFindMany.mockResolvedValue([]);
    mockBrandFindMany.mockResolvedValue([]);
    mockCellFindMany.mockResolvedValue([]);
    mockProductFindMany.mockResolvedValue([]);
    await expect(getStages("gato")).resolves.toEqual([]);
  });

  it("getBrands devuelve solo marcas con celda para especie+etapa, ordenadas", async () => {
    // Para perro+ADULTO: celdas b-proplan y b-maxxium. Old Prince no tiene celda
    // en este fixture → no aparece.
    const brands = await getBrands("perro", "t-adulto");
    expect(brands).toEqual([
      { brand: "Maxxium", id: "b-maxxium" },
      { brand: "Pro Plan", id: "b-proplan" },
    ]);
  });

  it("getProductsFor filtra el snapshot por especie+etapa+marca (ya clasificados)", async () => {
    const products = await getProductsFor("perro", "b-maxxium", "t-cachorro");
    expect(products).toEqual([
      {
        type: "bolsa",
        id: "p-2",
        label: "Maxxium Cachorro 10kg",
        price: 39000,
        priceKg: 2900.5,
      },
    ]);
  });

  it("getProductsFor sin match → []", async () => {
    await expect(getProductsFor("gato", "b-proplan", "t-adulto")).resolves.toEqual([]);
  });

  it("findCell encuentra la celda correcta (marca×tipo×especie)", async () => {
    const cell = await findCell("perro", "t-adulto", "b-proplan");
    expect(cell).toMatchObject({ id: "c-adulto-proplan", priceKg: 30000 });
    await expect(findCell("perro", "t-adulto", "b-oldprince")).resolves.toBeNull();
  });

  it("findCellById / findProductById buscan por id dentro del snapshot", async () => {
    await expect(findCellById("c-adulto-proplan")).resolves.toMatchObject({ priceKg: 30000 });
    await expect(findProductById("p-1")).resolves.toMatchObject({ name: "Pro Plan Adulto 15kg" });
    await expect(findProductById("zzz")).resolves.toBeNull();
  });

  it("getCellLabel arma 'Marca Etapa suelto'", async () => {
    await expect(getCellLabel("b-proplan", "t-adulto")).resolves.toBe("Pro Plan Adulto suelto");
  });
});

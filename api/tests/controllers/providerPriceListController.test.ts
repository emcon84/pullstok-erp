import fs from "fs";
import { Request, Response } from "express";
import { PDFParse } from "pdf-parse";
import {
  importPriceList,
  applyPriceList,
  buildSections,
  buildPriceApplyPlan,
  buildBrandOptionIndex,
  ApplyPriceListError,
} from "../../src/controllers/providerPriceListController";
import { prisma } from "../../src/config/db";

const tenantState = () =>
  (jest.requireMock("../../src/config/tenantContext") as {
    __state: { userId?: string; role?: string; organizationId?: string };
  }).__state;

jest.mock("../../src/config/db", () => ({
  prisma: {
    product: { findMany: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn(),
  },
  basePrisma: {},
}));

jest.mock("../../src/config/tenantContext", () => {
  // Simula el ALS real (fix round 2, finding C): el contexto vive en `state`;
  // requireOrganizationId lo lee (lanza si falta) y runWithTenant lo re-establece.
  const state: { userId?: string; role?: string; organizationId?: string } = {
    userId: "user-1",
    role: "ADMIN",
    organizationId: "org-1",
  };
  return {
    __state: state,
    requireOrganizationId: jest.fn(() => {
      if (!state.organizationId) {
        throw new Error("No hay contexto de organización (tenant) en este request");
      }
      return state.organizationId;
    }),
    runWithTenant: jest.fn((ctx: any, fn: () => unknown) => {
      Object.assign(state, ctx);
      return fn();
    }),
  };
});

jest.mock("pdf-parse", () => {
  // Espejo de la real: el controller hace `instanceof InvalidPDFException`
  // (fix round 2, finding D: PDF falso → 400, no 500).
  class InvalidPDFException extends Error {
    constructor(message?: string) {
      super(message ?? "Invalid PDF");
      this.name = "InvalidPDFException";
    }
  }
  return { PDFParse: jest.fn(), InvalidPDFException };
});

const mockedPrisma = prisma as unknown as {
  product: { findMany: jest.Mock; updateMany: jest.Mock };
  $transaction: jest.Mock;
};

const SECO_TXT = `LA RED COMERCIAL S.R.L
LISTA DE PRECIOS ALICAN - precios sin iva
VIGENCIA 10/08/2026 HOJA 1/1
SIEGER
LÍNEA SUPER PREMIUM PARA PERROS
SIEGER PUPPY
SIEGER Puppy Mini x 1 Kg. $ 8.795 $ 10.642 $ 14.190
SIEGER Adult Mini x 3 Kg. $ 19.395 $ 23.468 $ 31.292
SIEGER KATZE
LÍNEA SUPER PREMIUM PARA GATOS
KATZE KITTEN
Sieger Katze Kitten Inmuno Protect x 1 kg. $ 12.219 $ 14.785 $ 19.714`;

const WET_TXT = `LISTA DE PRECIOS ALICAN - precios sin iva
VIGENCIA 10/08/2026 HOJA 1/1
Sieger Puppy Salmon y Pollo WET x 100 gr. SIEGER 12 pouches x 100 gr $ 2.125,4 $ 2.571,7 $ 3.429,1
Sieger Criadores WET Pollo x 100 gr. SIEGER 12 pouches x 100 gr $ 2.125,4 $ 2.571,7 $ 3.429,1
DESCRIPCIÓN UNIDAD DE EMPAQUE`;

const fakeRes = () => {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
  return res;
};

const fakeReq = (overrides: Record<string, unknown> = {}) =>
  ({
    file: { path: "uploads/1234.pdf", originalname: "planilla.pdf" },
    query: {},
    body: {},
    ...overrides,
  }) as unknown as Request;

const txMock = () => ({
  priceList: {
    findFirst: jest.fn().mockResolvedValue(null),
    deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    create: jest.fn().mockResolvedValue({ id: "pl-1" }),
  },
  priceListSection: { create: jest.fn().mockResolvedValue({ id: "sec-1" }) },
  priceListEntry: { create: jest.fn().mockResolvedValue({ id: "ent-1" }) },
  product: {
    findMany: jest.fn().mockResolvedValue([]),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    create: jest.fn().mockResolvedValue({ id: "new-1" }),
  },
  // Models usados por applyPrices=true (sdd/alican-wholesale-price-list/apply-prices).
  categoryVariantDefinition: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  productVariant: { create: jest.fn().mockResolvedValue({ id: "pv-1" }) },
  // Proveedor de la planilla (sdd/alican-wholesale-price-list/providers).
  provider: {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: "prov-1" }),
  },
  branch: { findFirst: jest.fn().mockResolvedValue(null) },
  productStock: {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: "ps-1" }),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
});

const uuid = "00000000-0000-4000-8000-000000000001";

describe("buildSections — agrupación por jerarquía del PDF en orden de aparición", () => {
  it("groups consecutive rows by (marca, linea, sublinea)", () => {
    const sections = buildSections([
      { position: 0, accion: "import", nombre: "A", marca: "SIEGER", linea: "SUPER PREMIUM PARA PERROS", sublinea: "SIEGER PUPPY" },
      { position: 1, accion: "import", nombre: "B", marca: "SIEGER", linea: "SUPER PREMIUM PARA PERROS", sublinea: "SIEGER PUPPY" },
      { position: 2, accion: "import", nombre: "C", marca: "SIEGER", linea: "SUPER PREMIUM PARA PERROS", sublinea: "SIEGER ADULTO" },
      { position: 3, accion: "import", nombre: "D", marca: "AGILITY", linea: null, sublinea: null },
    ] as any);
    expect(sections).toHaveLength(3);
    expect(sections[0].entries.map((e) => e.nombre)).toEqual(["A", "B"]);
    expect(sections[1].subline).toBe("SIEGER ADULTO");
    expect(sections[2].brand).toBe("AGILITY");
  });

  it("produces a single flat section when there is no hierarchy (WET, D9)", () => {
    const sections = buildSections([
      { position: 0, accion: "import", nombre: "W1", marca: null, linea: null, sublinea: null },
      { position: 1, accion: "import", nombre: "W2", marca: null, linea: null, sublinea: null },
    ] as any);
    expect(sections).toHaveLength(1);
    expect(sections[0].entries).toHaveLength(2);
  });
});

describe("importPriceList — preview (dryRun default true)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedPrisma.product.findMany.mockResolvedValue([]);
    jest.spyOn(fs.promises, "readFile").mockResolvedValue(Buffer.from("fake-pdf"));
    jest.spyOn(fs.promises, "unlink").mockResolvedValue();
    (PDFParse as unknown as jest.Mock).mockImplementation(() => ({
      getText: jest.fn().mockResolvedValue({ text: SECO_TXT }),
    }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("parses the PDF, matches against the org catalog and returns the preview rows", async () => {
    const res = fakeRes();
    await importPriceList(fakeReq({ query: { dryRun: "true" } }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.layout).toBe("SECO");
    expect(body.period).toBe("2026-08-10");
    expect(body.sourceFilename).toBe("planilla.pdf");
    expect(body.total).toBe(3);
    // Sin catálogo → todas unmatched, con sugerido calculado server-side.
    expect(body.rows[0]).toMatchObject({
      position: 0,
      nombre: "SIEGER Puppy Mini x 1 Kg.",
      estado: "unmatched",
      sugerido: 14190.04,
    });
  });

  it("deletes the temporary upload after parsing (D5)", async () => {
    const res = fakeRes();
    await importPriceList(fakeReq({ query: { dryRun: "true" } }), res);
    expect(fs.promises.unlink).toHaveBeenCalledWith("uploads/1234.pdf");
  });

  it("returns 400 when no file was uploaded", async () => {
    const res = fakeRes();
    await importPriceList(fakeReq({ file: undefined }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 400 when the layout is not recognized (never silent)", async () => {
    (PDFParse as unknown as jest.Mock).mockImplementation(() => ({
      getText: jest.fn().mockResolvedValue({ text: "FACTURA SIN COLUMNAS DE PRECIOS" }),
    }));
    const res = fakeRes();
    await importPriceList(fakeReq({ query: { dryRun: "true" } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect((res.json as jest.Mock).mock.calls[0][0].message).toBe(
      "Formato de planilla no reconocido",
    );
  });

  it("detects WET and parses its flat rows", async () => {
    (PDFParse as unknown as jest.Mock).mockImplementation(() => ({
      getText: jest.fn().mockResolvedValue({ text: WET_TXT }),
    }));
    const res = fakeRes();
    await importPriceList(fakeReq({ query: { dryRun: "true" } }), res);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.layout).toBe("WET");
    expect(body.total).toBe(2);
    expect(body.rows[0].precioConIva).toBe(2571.7);
  });

  it("returns 400 when the uploaded file is not a real PDF (InvalidPDFException)", async () => {
    const { InvalidPDFException } = jest.requireMock("pdf-parse") as {
      InvalidPDFException: new (msg?: string) => Error;
    };
    (PDFParse as unknown as jest.Mock).mockImplementation(() => ({
      getText: jest.fn().mockRejectedValue(new InvalidPDFException("Corrupt PDF")),
    }));
    const res = fakeRes();
    await importPriceList(fakeReq({ query: { dryRun: "true" } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect((res.json as jest.Mock).mock.calls[0][0].message).toBe(
      "Formato de planilla no reconocido",
    );
  });

  it("re-establishes the tenant context from req.user when multer loses the ALS context", async () => {
    // Pérdida INTERMITENTE de contexto ALS por multer/busboy (finding C):
    // requireOrganizationId() lanzaría. req.user se setea ANTES de multer →
    // el controller re-establece el contexto desde ahí.
    delete tenantState().organizationId;

    const res = fakeRes();
    await importPriceList(
      fakeReq({
        query: { dryRun: "true" },
        user: { id: "user-1", role: "ADMIN", organizationId: "org-1" },
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(tenantState().organizationId).toBe("org-1");
  });
});

describe("applyPriceList — transacción idempotente (precios del proveedor intactos)", () => {
  const applyBody = {
    layout: "SECO",
    period: "2026-08-10",
    sourceFilename: "planilla.pdf",
    rows: [
      {
        position: 0,
        accion: "import",
        productId: uuid,
        nombre: "SIEGER Puppy Mini x 1 Kg.",
        marca: "SIEGER",
        linea: "SUPER PREMIUM PARA PERROS",
        sublinea: "SIEGER PUPPY",
        unidadEmpaque: "1 Kg.",
        precioSinIva: 8795,
        precioConIva: 10642,
      },
      { position: 1, accion: "omit", nombre: "STARTER Kit", precioSinIva: null, precioConIva: null },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    const tx = txMock();
    tx.product.findMany.mockResolvedValue([{ id: uuid }]);
    mockedPrisma.$transaction.mockImplementation(
      async (fn: (t: unknown) => unknown) => fn(tx),
    );
    // Mocks de importación (para el flujo ?dryRun=false que re-parsea el PDF).
    jest.spyOn(fs.promises, "readFile").mockResolvedValue(Buffer.from("fake-pdf"));
    jest.spyOn(fs.promises, "unlink").mockResolvedValue();
    (PDFParse as unknown as jest.Mock).mockImplementation(() => ({
      getText: jest.fn().mockResolvedValue({ text: SECO_TXT }),
    }));
  });

  it("persists PriceList + sections + entries and updates suggestedPrice (never product.price)", async () => {
    const tx = txMock();
    tx.product.findMany.mockResolvedValue([{ id: uuid }]);
    mockedPrisma.$transaction.mockImplementation(
      async (fn: (t: unknown) => unknown) => fn(tx),
    );
    const res = fakeRes();
    await applyPriceList(fakeReq({ body: applyBody }), res);

    expect(tx.priceList.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: "org-1",
          type: "SECO",
          period: "2026-08-10",
          provider: "ALICAN",
        }),
      }),
    );
    expect(tx.priceListSection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ brand: "SIEGER", line: "SUPER PREMIUM PARA PERROS", subline: "SIEGER PUPPY", position: 0 }),
      }),
    );
    const entryCall = tx.priceListEntry.create.mock.calls[0][0].data;
    expect(entryCall).toMatchObject({
      name: "SIEGER Puppy Mini x 1 Kg.",
      productId: uuid,
      priceSinIva: 8795,
      priceConIva: 10642,
      suggestedPrice: 14190.04,
      position: 0,
    });
    // suggestedPrice se escribe; product.price NUNCA.
    const updateCall = tx.product.updateMany.mock.calls[0];
    expect(updateCall[0]).toEqual({ where: { id: uuid }, data: { suggestedPrice: 14190.04 } });
    expect(updateCall[0].data.price).toBeUndefined();

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      priceListId: "pl-1",
      imported: 1,
      omitted: 1,
      suggestedUpdated: 1,
      priceUpdated: 0,
      productsCreated: 0,
    });
  });

  it("is idempotent: deletes the existing plan of the same (org, type, period) before recreating", async () => {
    const tx = txMock();
    tx.priceList.findFirst.mockResolvedValue({ id: "pl-vieja" });
    tx.product.findMany.mockResolvedValue([{ id: uuid }]);
    mockedPrisma.$transaction.mockImplementation(
      async (fn: (t: unknown) => unknown) => fn(tx),
    );
    const res = fakeRes();
    await applyPriceList(fakeReq({ body: applyBody }), res);
    expect(tx.priceList.deleteMany).toHaveBeenCalledWith({ where: { id: "pl-vieja" } });
  });

  it("writes suggestedPrice ONCE per product even with duplicated imports of the same product", async () => {
    const tx = txMock();
    tx.product.findMany.mockResolvedValue([{ id: uuid }]);
    mockedPrisma.$transaction.mockImplementation(
      async (fn: (t: unknown) => unknown) => fn(tx),
    );
    const res = fakeRes();
    const body = {
      ...applyBody,
      rows: [
        { ...applyBody.rows[0], position: 0 },
        { ...applyBody.rows[0], position: 1, nombre: "SIEGER Puppy Mini x 1 Kg. (lote B)" },
      ],
    };
    await applyPriceList(fakeReq({ body }), res);
    expect(tx.product.updateMany).toHaveBeenCalledTimes(1);
  });

  it("returns 400 when a manual productId is outside the org", async () => {
    const tx = txMock();
    tx.product.findMany.mockResolvedValue([]); // el producto no pertenece a la org
    mockedPrisma.$transaction.mockImplementation(
      async (fn: (t: unknown) => unknown) => fn(tx),
    );
    const res = fakeRes();
    await applyPriceList(fakeReq({ body: applyBody }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 400 when there are no importable rows", async () => {
    const res = fakeRes();
    await applyPriceList(
      fakeReq({ body: { ...applyBody, rows: [{ position: 0, accion: "omit", nombre: "X" }] } }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 400 when two rows of a duplicate group are both imported", async () => {
    const res = fakeRes();
    const body = {
      ...applyBody,
      rows: [
        { ...applyBody.rows[0], position: 0, nombre: "DUP x 1 Kg." },
        { ...applyBody.rows[0], position: 1, nombre: "dup x 1 kg" },
      ],
    };
    await applyPriceList(fakeReq({ body }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("imports a planilla-only row (import without productId): entry productId null, matched false, no suggestedPrice update", async () => {
    const tx = txMock();
    tx.product.findMany.mockResolvedValue([]);
    mockedPrisma.$transaction.mockImplementation(
      async (fn: (t: unknown) => unknown) => fn(tx),
    );
    const res = fakeRes();
    const body = {
      ...applyBody,
      rows: [
        { ...applyBody.rows[0], productId: undefined, nombre: "Producto Sin Match x 3 Kg." },
      ],
    };
    await applyPriceList(fakeReq({ body }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    const entryData = tx.priceListEntry.create.mock.calls[0][0].data;
    expect(entryData).toMatchObject({
      name: "Producto Sin Match x 3 Kg.",
      productId: null,
      matched: false,
      priceSinIva: 8795,
      priceConIva: 10642,
    });
    // Planilla-only: suggestedPrice se calcula en la entrada, pero NO se
    // escribe en ningún Product.
    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      priceListId: "pl-1",
      imported: 1,
      omitted: 0,
      suggestedUpdated: 0,
      priceUpdated: 0,
      productsCreated: 0,
    });
  });

  it("allows two planilla-only rows with the same normalized name (both imported, no 400)", async () => {
    const tx = txMock();
    tx.product.findMany.mockResolvedValue([]);
    mockedPrisma.$transaction.mockImplementation(
      async (fn: (t: unknown) => unknown) => fn(tx),
    );
    const res = fakeRes();
    const body = {
      ...applyBody,
      rows: [
        { ...applyBody.rows[0], productId: undefined, position: 0, nombre: "DUP x 1 Kg." },
        { ...applyBody.rows[0], productId: undefined, position: 1, nombre: "dup x 1 kg" },
      ],
    };
    await applyPriceList(fakeReq({ body }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(tx.priceListEntry.create).toHaveBeenCalledTimes(2);
    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });

  it("returns 400 when an import row has no prices (error row cannot be imported)", async () => {
    const res = fakeRes();
    const body = {
      ...applyBody,
      rows: [
        { ...applyBody.rows[0], precioSinIva: null, precioConIva: null, nombre: "STARTER Kit" },
      ],
    };
    await applyPriceList(fakeReq({ body }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("applies default decisions when dryRun=false (D10): matched/multi-match imported, rest omitted", async () => {
    mockedPrisma.product.findMany.mockResolvedValue([
      { id: uuid, name: "SIEGER Puppy Mini x 1 Kg.", code: null, variantAssignments: [] },
    ]);
    const tx = txMock();
    tx.product.findMany.mockResolvedValue([{ id: uuid }]);
    mockedPrisma.$transaction.mockImplementation(
      async (fn: (t: unknown) => unknown) => fn(tx),
    );
    const res = fakeRes();
    await importPriceList(fakeReq({ query: { dryRun: "false" } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(tx.product.updateMany).toHaveBeenCalledTimes(1);
  });
});

describe("buildPriceApplyPlan — plan de aplicación de precios (apply-prices)", () => {
  it("cuenta actualizaciones (matched con Con IVA) y creaciones (sin match con Con IVA)", () => {
    const plan = buildPriceApplyPlan([
      { position: 0, accion: "import", productId: uuid, nombre: "A", marca: "SIEGER", precioConIva: 100 },
      { position: 1, accion: "import", nombre: "B", marca: "SIEGER", precioConIva: 200 },
      { position: 2, accion: "import", productId: uuid, nombre: "C", precioConIva: null },
      { position: 3, accion: "omit", nombre: "D", precioConIva: 300 },
      { position: 4, accion: "import", nombre: "E", precioConIva: null, precioSinIva: 100 },
    ] as any);
    expect(plan).toEqual({
      priceUpdates: 1,
      creates: [{ name: "B", marca: "SIEGER" }],
    });
  });

  it("no cuenta filas sin precio Con IVA (ni update ni create, decisión 5)", () => {
    const plan = buildPriceApplyPlan([
      { position: 0, accion: "import", productId: uuid, nombre: "X", precioConIva: null, precioSinIva: 50 },
      { position: 1, accion: "import", nombre: "Y", precioConIva: null, precioSinIva: 50 },
    ] as any);
    expect(plan.priceUpdates).toBe(0);
    expect(plan.creates).toHaveLength(0);
  });
});

describe("buildBrandOptionIndex — índice de marcas del sistema (variante Marca)", () => {
  it("normaliza valores y conserva el primer match por key normalizada", () => {
    const index = buildBrandOptionIndex([
      { id: "o1", value: "SIEGER" },
      { id: "o2", value: "sieger" }, // duplicado normalizado → se ignora
      { id: "o3", value: "7 VIDAS" },
      { id: "o4", value: "  Maxxium  Perros " },
    ]);
    expect(index.get("sieger")).toBe("o1");
    expect(index.get("7 vidas")).toBe("o3");
    expect(index.get("maxxium perros")).toBe("o4");
    expect(index.size).toBe(3);
  });
});

describe("applyPriceList — aplicar precios al catálogo (applyPrices=true)", () => {
  const applyBody = {
    layout: "SECO" as const,
    period: "2026-08-10",
    sourceFilename: "planilla.pdf",
    rows: [
      {
        position: 0,
        accion: "import" as const,
        productId: uuid,
        nombre: "SIEGER Puppy Mini x 1 Kg.",
        marca: "SIEGER",
        linea: "SUPER PREMIUM PARA PERROS",
        sublinea: "SIEGER PUPPY",
        unidadEmpaque: "1 Kg.",
        precioSinIva: 8795,
        precioConIva: 10642,
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(fs.promises, "readFile").mockResolvedValue(Buffer.from("fake-pdf"));
    jest.spyOn(fs.promises, "unlink").mockResolvedValue();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("actualiza product.price de las filas matcheadas y crea las no matcheadas asociando la marca", async () => {
    const tx = txMock();
    tx.product.findMany
      .mockResolvedValueOnce([{ id: uuid }]) // anti-fuga: el producto está en la org
      .mockResolvedValueOnce([]); // índice de existentes: nada aún
    tx.categoryVariantDefinition.findMany.mockResolvedValue([
      { options: [{ id: "opt-marca", value: "SIEGER" }] },
    ]);
    tx.product.create.mockResolvedValue({ id: "new-1" });
    mockedPrisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));

    const res = fakeRes();
    const body = {
      ...applyBody,
      applyPrices: true,
      rows: [
        { ...applyBody.rows[0], position: 0 }, // matched
        {
          ...applyBody.rows[0],
          position: 1,
          productId: undefined,
          nombre: "GOOSTER Adultos x 15 Kg.",
          marca: "SIEGER",
        }, // sin match → create
      ],
    };
    await applyPriceList(fakeReq({ body }), res);

    // Matched: UNA escritura con suggestedPrice + price (Con IVA directo).
    const matchedUpdate = tx.product.updateMany.mock.calls.find((c) => c[0].where.id === uuid);
    expect(matchedUpdate[0].data).toEqual({ suggestedPrice: 14190.04, price: 10642 });
    // Sin match: se crea el producto (name, price, sin categoría) con su marca.
    expect(tx.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "GOOSTER Adultos x 15 Kg.",
          price: 10642,
          categoryId: null,
          quantity: 0,
        }),
      }),
    );
    expect(tx.productVariant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ productId: "new-1", optionId: "opt-marca", organizationId: "org-1" }),
      }),
    );
    // La entry del creado queda vinculada a su productId (ciclo mensual).
    const createdEntry = tx.priceListEntry.create.mock.calls[1][0].data;
    expect(createdEntry).toMatchObject({ name: "GOOSTER Adultos x 15 Kg.", productId: "new-1", matched: true });
    // El producto creado NO pasa por updateMany (ya llevó price+sugerido en el create).
    expect(tx.product.updateMany).toHaveBeenCalledTimes(1);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      priceListId: "pl-1",
      imported: 2,
      omitted: 0,
      suggestedUpdated: 2,
      priceUpdated: 1,
      productsCreated: 1,
    });
  });

  it("no asocia marca cuando no hay una opción equivalente en el sistema", async () => {
    const tx = txMock();
    tx.product.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    tx.categoryVariantDefinition.findMany.mockResolvedValue([
      { options: [{ id: "opt-otra", value: "OTRA MARCA" }] },
    ]);
    tx.product.create.mockResolvedValue({ id: "new-1" });
    mockedPrisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));

    const res = fakeRes();
    const body = {
      ...applyBody,
      applyPrices: true,
      rows: [{ ...applyBody.rows[0], position: 0, productId: undefined, nombre: "SIN MARCA x 1 Kg.", marca: "SIEGER" }],
    };
    await applyPriceList(fakeReq({ body }), res);

    expect(tx.product.create).toHaveBeenCalledTimes(1);
    expect(tx.productVariant.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("fila sin match con precioConIva null: NO se crea (planilla-only), mantiene comportamiento", async () => {
    const tx = txMock();
    tx.product.findMany.mockResolvedValue([]);
    mockedPrisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));

    const res = fakeRes();
    const body = {
      ...applyBody,
      applyPrices: true,
      rows: [
        { position: 0, accion: "import" as const, nombre: "GOOSTER Sin Con IVA x 15 Kg.", precioSinIva: 8795, precioConIva: null },
      ],
    };
    await applyPriceList(fakeReq({ body }), res);

    expect(tx.product.create).not.toHaveBeenCalled();
    const entryData = tx.priceListEntry.create.mock.calls[0][0].data;
    expect(entryData).toMatchObject({ productId: null, matched: false });
    expect(res.json).toHaveBeenCalledWith({
      priceListId: "pl-1",
      imported: 1,
      omitted: 0,
      suggestedUpdated: 0,
      priceUpdated: 0,
      productsCreated: 0,
    });
  });

  it("reutiliza un producto existente con el mismo nombre normalizado en vez de duplicar", async () => {
    const tx = txMock();
    // Sin productId en el payload → la anti-fuga no corre; el ÚNICO findMany
    // de product es el índice de existentes (reutiliza).
    tx.product.findMany.mockResolvedValue([
      { id: "existente-1", name: "GOOSTER Adultos x 15 Kg." },
    ]);
    tx.categoryVariantDefinition.findMany.mockResolvedValue([]);
    mockedPrisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));

    const res = fakeRes();
    const body = {
      ...applyBody,
      applyPrices: true,
      rows: [
        { position: 0, accion: "import" as const, nombre: "GOOSTER ADULTOS X 15 KG.", precioSinIva: 8795, precioConIva: 10642 },
      ],
    };
    await applyPriceList(fakeReq({ body }), res);

    expect(tx.product.create).not.toHaveBeenCalled();
    const entryData = tx.priceListEntry.create.mock.calls[0][0].data;
    expect(entryData.productId).toBe("existente-1");
    // El producto reutilizado recibe price + suggestedPrice (tratado como matched).
    expect(tx.product.updateMany).toHaveBeenCalledWith(
      { where: { id: "existente-1" }, data: { suggestedPrice: 14190.04, price: 10642 } },
    );
    expect(res.json).toHaveBeenCalledWith({
      priceListId: "pl-1",
      imported: 1,
      omitted: 0,
      suggestedUpdated: 1,
      priceUpdated: 1,
      productsCreated: 0,
    });
  });
});

describe("applyPriceList — proveedor de la planilla (providerName)", () => {
  const applyBody = {
    layout: "SECO" as const,
    period: "2026-08-10",
    sourceFilename: "planilla.pdf",
    applyPrices: true,
    providerName: "ALICAN",
    rows: [
      {
        position: 0,
        accion: "import" as const,
        productId: uuid,
        nombre: "SIEGER Puppy Mini x 1 Kg.",
        marca: "SIEGER",
        linea: "SUPER PREMIUM PARA PERROS",
        sublinea: "SIEGER PUPPY",
        unidadEmpaque: "1 Kg.",
        precioSinIva: 8795,
        precioConIva: 10642,
      },
      {
        position: 1,
        accion: "import" as const,
        nombre: "GOOSTER Adultos x 15 Kg.",
        marca: "SIEGER",
        precioSinIva: 20000,
        precioConIva: 24200,
      },
    ],
  };

  const setupTx = (providerFind: { id: string } | null) => {
    const tx = txMock();
    tx.product.findMany
      .mockResolvedValueOnce([{ id: uuid }]) // anti-fuga: el matched está en la org
      .mockResolvedValueOnce([]); // índice de existentes: nada aún
    tx.provider.findFirst.mockResolvedValue(providerFind);
    tx.provider.create.mockResolvedValue({ id: "prov-1" });
    tx.product.create.mockResolvedValue({ id: "new-1" });
    mockedPrisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));
    return tx;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("crea el proveedor (no existe) y asigna providerId a los matcheados y a los creados", async () => {
    const tx = setupTx(null);
    const res = fakeRes();
    await applyPriceList(fakeReq({ body: applyBody }), res);

    // Proveedor creado con el nombre exacto (trimmed) scopeado a la org.
    expect(tx.provider.create).toHaveBeenCalledWith({
      data: { name: "ALICAN", organizationId: "org-1" },
    });
    // Producto matcheado: updateMany con suggestedPrice + price + providerId.
    const matchedUpdate = tx.product.updateMany.mock.calls.find((c) => c[0].where.id === uuid);
    expect(matchedUpdate[0].data).toEqual({
      suggestedPrice: 14190.04,
      price: 10642,
      providerId: "prov-1",
    });
    // Producto creado: providerId en el create.
    expect(tx.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ providerId: "prov-1", name: "GOOSTER Adultos x 15 Kg." }),
      }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("reutiliza un proveedor existente por nombre (case-insensitive) sin crear otro", async () => {
    const tx = setupTx({ id: "prov-existente" });
    const res = fakeRes();
    await applyPriceList(
      fakeReq({ body: { ...applyBody, providerName: "  alican " } }),
      res,
    );

    expect(tx.provider.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: "org-1",
        name: { equals: "alican", mode: "insensitive" },
      },
      select: { id: true },
    });
    expect(tx.provider.create).not.toHaveBeenCalled();
    const matchedUpdate = tx.product.updateMany.mock.calls.find((c) => c[0].where.id === uuid);
    expect(matchedUpdate[0].data.providerId).toBe("prov-existente");
  });

  it("sin providerName NO resuelve proveedor ni toca providerId (back-compat)", async () => {
    const tx = setupTx(null);
    const res = fakeRes();
    const body = { ...applyBody, providerName: undefined };
    await applyPriceList(fakeReq({ body }), res);

    expect(tx.provider.findFirst).not.toHaveBeenCalled();
    expect(tx.provider.create).not.toHaveBeenCalled();
    const matchedUpdate = tx.product.updateMany.mock.calls.find((c) => c[0].where.id === uuid);
    expect(matchedUpdate[0].data.providerId).toBeUndefined();
    expect(tx.product.create).toHaveBeenCalledWith(
      expect.not.objectContaining({
        data: expect.objectContaining({ providerId: expect.any(String) }),
      }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("filas planilla-only (sin productId) no resuelven el proveedor ni tocan producto", async () => {
    const tx = txMock();
    tx.product.findMany.mockResolvedValue([]); // sin productId → no anti-fuga ni índice
    mockedPrisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));

    const res = fakeRes();
    const body = {
      ...applyBody,
      rows: [
        {
          position: 0,
          accion: "import" as const,
          nombre: "GOOSTER Adultos x 15 Kg.",
          precioSinIva: 20000,
          precioConIva: null,
        },
      ],
    };
    await applyPriceList(fakeReq({ body }), res);

    expect(tx.provider.findFirst).not.toHaveBeenCalled();
    expect(tx.provider.create).not.toHaveBeenCalled();
    expect(tx.product.create).not.toHaveBeenCalled();
    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe("ApplyPriceListError", () => {
  it("carries a user-facing message", () => {
    const err = new ApplyPriceListError("No hay filas para importar");
    expect(err.message).toBe("No hay filas para importar");
    expect(err.name).toBe("ApplyPriceListError");
  });
});

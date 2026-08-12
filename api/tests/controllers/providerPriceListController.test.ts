import fs from "fs";
import { Request, Response } from "express";
import { PDFParse } from "pdf-parse";
import {
  importPriceList,
  applyPriceList,
  buildSections,
  ApplyPriceListError,
} from "../../src/controllers/providerPriceListController";
import { prisma } from "../../src/config/db";

jest.mock("../../src/config/db", () => ({
  prisma: {
    product: { findMany: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn(),
  },
  basePrisma: {},
}));

jest.mock("../../src/config/tenantContext", () => ({
  requireOrganizationId: jest.fn().mockReturnValue("org-1"),
}));

jest.mock("pdf-parse", () => ({
  PDFParse: jest.fn(),
}));

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

  it("returns 400 when an import row has no productId", async () => {
    const res = fakeRes();
    const body = {
      ...applyBody,
      rows: [{ ...applyBody.rows[0], productId: undefined }],
    };
    await applyPriceList(fakeReq({ body }), res);
    expect(res.status).toHaveBeenCalledWith(400);
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

describe("ApplyPriceListError", () => {
  it("carries a user-facing message", () => {
    const err = new ApplyPriceListError("No hay filas para importar");
    expect(err.message).toBe("No hay filas para importar");
    expect(err.name).toBe("ApplyPriceListError");
  });
});

import { Request, Response } from "express";
import productController from "../../src/controllers/productController";
import { prisma } from "../../src/config/db";

jest.mock("../../src/config/db", () => ({
  prisma: {
    product: { findMany: jest.fn(), count: jest.fn() },
    priceKgType: { findMany: jest.fn() },
  },
  basePrisma: {},
}));

jest.mock("../../src/config/tenantContext", () => ({
  requireOrganizationId: jest.fn().mockReturnValue("org-1"),
}));

const mockedPrisma = prisma as unknown as {
  product: { findMany: jest.Mock; count: jest.Mock };
  priceKgType: { findMany: jest.Mock };
};

const mockRequest = (query: Record<string, string> = {}) =>
  ({ query } as unknown as Request);

const mockResponse = () => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  return res;
};

// Forma mínima que lee el front de cada asignación de variante (ProductDrawer,
// ModalContent, FilterChips, productFilter, printGrouping, StockScannerPage).
// Se dejan de enviar ids/organizationId de la asignación y sortOrder de la
// opción: eran la mayor parte de los ~5,7 MB de la lista completa.
const VARIANT_ASSIGNMENTS_SELECT = {
  select: {
    option: {
      select: {
        id: true,
        value: true,
        variantId: true,
        variant: { select: { id: true, name: true } },
      },
    },
  },
};

describe("productController.getProducts — payload de la lista", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedPrisma.product.findMany.mockResolvedValue([]);
    mockedPrisma.product.count.mockResolvedValue(0);
  });

  it("lista completa (sin paginar): pide solo los campos de variante que usa el front", async () => {
    await productController.getProducts(mockRequest(), mockResponse());

    const args = mockedPrisma.product.findMany.mock.calls[0][0];
    expect(args.include.variantAssignments).toEqual(VARIANT_ASSIGNMENTS_SELECT);
  });

  it("lista paginada: usa el mismo select de variantes", async () => {
    await productController.getProducts(
      mockRequest({ page: "1", pageSize: "30" }),
      mockResponse(),
    );

    const args = mockedPrisma.product.findMany.mock.calls[0][0];
    expect(args.include.variantAssignments).toEqual(VARIANT_ASSIGNMENTS_SELECT);
  });

  it("conserva la categoría y el proveedor y no pierde la sección de planilla", async () => {
    mockedPrisma.product.findMany.mockResolvedValue([
      {
        id: "p1",
        name: "ROYAL CANIN MEDIUM ADULT 15KG",
        price: 100,
        unitsPerBox: null,
        category: { id: "c1", name: "Alimento" },
        provider: { id: "pr1", name: "ALICAN" },
        variantAssignments: [
          {
            option: {
              id: "o1",
              value: "Royal Canin",
              variantId: "v1",
              variant: { id: "v1", name: "Marca" },
            },
          },
        ],
        priceListEntries: [
          { section: { brand: "ROYAL", line: null, subline: null, position: 1 } },
        ],
      },
    ]);
    const res = mockResponse();

    await productController.getProducts(mockRequest(), res);

    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body).toHaveLength(1);
    expect(body[0].category).toEqual({ id: "c1", name: "Alimento" });
    expect(body[0].provider).toEqual({ id: "pr1", name: "ALICAN" });
    expect(body[0].planSection).toEqual({
      brand: "ROYAL",
      line: null,
      subline: null,
      position: 1,
    });
    expect(body[0].variantAssignments).toEqual([
      {
        option: {
          id: "o1",
          value: "Royal Canin",
          variantId: "v1",
          variant: { id: "v1", name: "Marca" },
        },
      },
    ]);
  });


  describe("Server-Timing (medición de dónde se va el tiempo del servidor)", () => {
    const timingHeader = (res: Response) =>
      (res.setHeader as jest.Mock).mock.calls.find(
        ([name]) => name === "Server-Timing",
      )?.[1] as string | undefined;

    it("la lista completa informa db y map", async () => {
      const res = mockResponse();

      await productController.getProducts(mockRequest(), res);

      expect(timingHeader(res)).toMatch(/^db;dur=\d+\.\d, map;dur=\d+\.\d$/);
    });

    it("la lista paginada informa db y map", async () => {
      const res = mockResponse();

      await productController.getProducts(
        mockRequest({ page: "1", pageSize: "30" }),
        res,
      );

      expect(timingHeader(res)).toMatch(/^db;dur=\d+\.\d, map;dur=\d+\.\d$/);
    });
  });
});

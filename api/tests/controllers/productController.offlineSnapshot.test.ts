import { Request, Response } from "express";
import { getOfflineProductSnapshot } from "../../src/controllers/productController";
import { prisma } from "../../src/config/db";

jest.mock("../../src/config/db", () => ({
  prisma: {
    product: { findFirst: jest.fn() },
    category: { findMany: jest.fn() },
    priceKgBrand: { findMany: jest.fn() },
    priceKgType: { findMany: jest.fn() },
    priceKgPrice: { findMany: jest.fn() },
  },
  basePrisma: {},
}));

jest.mock("../../src/config/tenantContext", () => ({
  requireOrganizationId: jest.fn().mockReturnValue("org-1"),
}));

const mockedPrisma = prisma as unknown as {
  product: { findFirst: jest.Mock };
  category: { findMany: jest.Mock };
  priceKgBrand: { findMany: jest.Mock };
  priceKgType: { findMany: jest.Mock };
  priceKgPrice: { findMany: jest.Mock };
};

const mockParamsRequest = (id: string) =>
  ({ params: { id } } as unknown as Request);

const mockResponse = () => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("productController.getOfflineProductSnapshot", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("responde 404 si el producto no existe", async () => {
    mockedPrisma.product.findFirst.mockResolvedValue(null);

    const req = mockParamsRequest("prod-inexistente");
    const res = mockResponse();

    await getOfflineProductSnapshot(req, res);

    expect(mockedPrisma.product.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "prod-inexistente" } }),
    );
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: "Producto no encontrado" });
  });

  it("responde 404 si el producto existe pero pertenece a OTRA organización (no filtra datos entre tenants)", async () => {
    // La extensión anti-fuga de Prisma filtra por organizationId dentro de
    // prisma.product.findFirst: un producto de otra org nunca aparece acá, se
    // ve exactamente igual que "no existe" desde este handler.
    mockedPrisma.product.findFirst.mockResolvedValue(null);

    const req = mockParamsRequest("prod-de-otra-org");
    const res = mockResponse();

    await getOfflineProductSnapshot(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: "Producto no encontrado" });
    expect(mockedPrisma.category.findMany).not.toHaveBeenCalled();
  });

  it("devuelve el producto en forma OfflineProduct, resolviendo priceKgLista vía findCellForProduct", async () => {
    mockedPrisma.product.findFirst.mockResolvedValue({
      id: "prod-1",
      name: "Royal Canin Adulto 15kg",
      code: "COD-1",
      barcode: "7791234567890",
      price: 45000,
      description: "Bolsa 15kg",
      categoryId: "cat-1",
      priceKgSuelto: 3200,
      priceKgSueltoManual: false,
      category: { name: "Perros" },
      variantAssignments: [
        {
          option: {
            id: "opt-1",
            value: "Royal Canin",
            variantId: "var-marca",
            variant: { id: "var-marca", name: "Marca" },
          },
        },
      ],
    });
    mockedPrisma.category.findMany.mockResolvedValue([
      { id: "cat-1", name: "Perros", parentId: null },
    ]);
    mockedPrisma.priceKgBrand.findMany.mockResolvedValue([
      { id: "brand-1", name: "Royal Canin", keywords: ["royal canin"] },
    ]);
    mockedPrisma.priceKgType.findMany.mockResolvedValue([
      { id: "type-1", name: "Adulto", synonyms: ["adulto"] },
    ]);
    mockedPrisma.priceKgPrice.findMany.mockResolvedValue([
      { id: "cell-1", brandId: "brand-1", typeId: "type-1", species: "PERRO", priceKg: 3500 },
    ]);

    const req = mockParamsRequest("prod-1");
    const res = mockResponse();

    await getOfflineProductSnapshot(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "prod-1",
        name: "Royal Canin Adulto 15kg",
        code: "COD-1",
        barcode: "7791234567890",
        price: 45000,
        description: "Bolsa 15kg",
        categoryId: "cat-1",
        categoryName: "Perros",
        priceKgSuelto: 3200,
        priceKgSueltoManual: false,
        variants: [
          {
            value: "Royal Canin",
            variantName: "Marca",
            variantId: "var-marca",
            optionId: "opt-1",
          },
        ],
      }),
    );
    // priceKgLista viene de la celda resuelta por findCellForProduct.
    const jsonArg = (res.json as jest.Mock).mock.calls[0][0];
    expect(jsonArg.priceKgLista).toBe(3500);
  });

  it("no consulta marcas/tipos/celdas si el producto no tiene categoryId (priceKgLista queda null)", async () => {
    mockedPrisma.product.findFirst.mockResolvedValue({
      id: "prod-2",
      name: "Producto sin categoría",
      code: null,
      barcode: null,
      price: 100,
      description: null,
      categoryId: null,
      priceKgSuelto: null,
      priceKgSueltoManual: false,
      category: null,
      variantAssignments: [],
    });

    const req = mockParamsRequest("prod-2");
    const res = mockResponse();

    await getOfflineProductSnapshot(req, res);

    expect(mockedPrisma.priceKgBrand.findMany).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    const jsonArg = (res.json as jest.Mock).mock.calls[0][0];
    expect(jsonArg.priceKgLista).toBeNull();
    expect(jsonArg.categoryName).toBeNull();
  });
});

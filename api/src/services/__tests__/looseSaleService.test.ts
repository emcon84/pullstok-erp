/**
 * Unit tests de looseSaleService (sdd/loose-lines-stock). Sin DB: el service
 * recibe `tx` inyectado; prisma (usado solo por los getters/listados) está
 * mockeado como módulo.
 */
import {
  looseLineName,
  resolveCellForProduct,
  openBag,
} from "../looseSaleService";

jest.mock("../../config/db", () => ({
  prisma: {
    looseStock: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
  },
  basePrisma: {},
}));

const makeTx = () => ({
  product: { findFirst: jest.fn() },
  category: { findMany: jest.fn() },
  priceKgBrand: { findMany: jest.fn() },
  priceKgType: { findMany: jest.fn() },
  priceKgPrice: { findMany: jest.fn(), findFirst: jest.fn() },
  productStock: { updateMany: jest.fn() },
  looseStock: { findFirst: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
});

// Producto "MAXXIUM ADULTO" + celda de la planilla que lo matchea (sin
// categorías → species AMBOS). El matching es el real (findCellForProduct).
const productRow = { id: "p-1", name: "MAXXIUM ADULTO", categoryId: null, weightKg: 15 };
const brandRow = { id: "b-1", name: "Maxxium", keywords: [] };
const typeRow = { id: "t-1", name: "Adulto", synonyms: [] };
const cellRow = {
  id: "cell-1",
  brandId: "b-1",
  typeId: "t-1",
  species: "AMBOS",
  priceKg: 2500,
  brand: { name: "MAXIUM" },
  type: { name: "ADULTO" },
};

// Resuelve la celda desde el tx: mockeas las queries que usa
// resolveCellForProduct para que el matching real encuentre la celda.
const mockCellResolution = (
  tx: ReturnType<typeof makeTx>,
  cells: typeof cellRow[],
) => {
  tx.category.findMany.mockResolvedValue([]);
  tx.priceKgBrand.findMany.mockResolvedValue([brandRow]);
  tx.priceKgType.findMany.mockResolvedValue([typeRow]);
  tx.priceKgPrice.findMany.mockResolvedValue(cells);
};

describe("looseLineName", () => {
  it("combina marca y tipo con separador", () => {
    expect(looseLineName("MAXXIUM", "ADULTO")).toBe("MAXXIUM · ADULTO");
  });

  it("oculta la parte vacía", () => {
    expect(looseLineName("MAXXIUM", "")).toBe("MAXXIUM");
    expect(looseLineName("", "ADULTO")).toBe("ADULTO");
  });

  it("dos vacíos → string vacío", () => {
    expect(looseLineName("", "")).toBe("");
  });
});

describe("resolveCellForProduct", () => {
  it("devuelve la celda que matchea el producto (matching real)", async () => {
    const tx = makeTx();
    tx.product.findFirst.mockResolvedValue(productRow);
    mockCellResolution(tx, [cellRow]);

    const cell = await resolveCellForProduct(tx, "org-1", "p-1");
    expect(cell).not.toBeNull();
    expect(cell!.id).toBe("cell-1");
    expect(cell!.brand!.name).toBe("MAXIUM");
    expect(cell!.type!.name).toBe("ADULTO");
  });

  it("devuelve null cuando el producto no existe", async () => {
    const tx = makeTx();
    tx.product.findFirst.mockResolvedValue(null);

    const cell = await resolveCellForProduct(tx, "org-1", "p-1");
    expect(cell).toBeNull();
  });

  it("devuelve null cuando no hay celda para el producto", async () => {
    const tx = makeTx();
    tx.product.findFirst.mockResolvedValue(productRow);
    mockCellResolution(tx, []);

    const cell = await resolveCellForProduct(tx, "org-1", "p-1");
    expect(cell).toBeNull();
  });
});

describe("openBag", () => {
  const input = { productId: "p-1", branchId: "b-1", priceKgPriceId: "cell-1" };

  it("LOOSE_BAG_NOT_FOUND: producto inexistente", async () => {
    const tx = makeTx();
    tx.product.findFirst.mockResolvedValue(null);

    const err: any = await openBag(tx, "org-1", input).catch((e: any) => e);
    expect(err.code).toBe("LOOSE_BAG_NOT_FOUND");
    expect(tx.productStock.updateMany).not.toHaveBeenCalled();
  });

  it("LOOSE_BAG_NO_WEIGHT: producto sin weightKg", async () => {
    const tx = makeTx();
    tx.product.findFirst.mockResolvedValue({ ...productRow, weightKg: null });

    const err: any = await openBag(tx, "org-1", input).catch((e: any) => e);
    expect(err.code).toBe("LOOSE_BAG_NO_WEIGHT");
    expect(tx.productStock.updateMany).not.toHaveBeenCalled();
  });

  it("LOOSE_LINE_NOT_FOUND: la celda destino no existe en la planilla", async () => {
    const tx = makeTx();
    tx.product.findFirst.mockResolvedValue(productRow);
    tx.priceKgPrice.findFirst.mockResolvedValue(null);

    const err: any = await openBag(tx, "org-1", input).catch((e: any) => e);
    expect(err.code).toBe("LOOSE_LINE_NOT_FOUND");
    expect(tx.productStock.updateMany).not.toHaveBeenCalled();
  });

  it("LOOSE_BAG_INSUFFICIENT_STOCK: sin unidades de bolsa en la sucursal", async () => {
    const tx = makeTx();
    tx.product.findFirst.mockResolvedValue(productRow);
    tx.priceKgPrice.findFirst.mockResolvedValue(cellRow);
    tx.productStock.updateMany.mockResolvedValue({ count: 0 });

    const err: any = await openBag(tx, "org-1", input).catch((e: any) => e);
    expect(err.code).toBe("LOOSE_BAG_INSUFFICIENT_STOCK");
    expect(tx.looseStock.create).not.toHaveBeenCalled();
    expect(tx.looseStock.updateMany).not.toHaveBeenCalled();
  });

  it("abre una bolsa: descuenta 1 unidad del ProductStock y crea LooseStock con weightKg", async () => {
    const tx = makeTx();
    tx.product.findFirst.mockResolvedValue(productRow);
    tx.priceKgPrice.findFirst.mockResolvedValue(cellRow);
    tx.productStock.updateMany.mockResolvedValue({ count: 1 });
    // Sin fila existente → create.
    tx.looseStock.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "ls-1",
        priceKgPriceId: "cell-1",
        branchId: "b-1",
        quantity: 15,
        organizationId: "org-1",
      });

    const result = await openBag(tx, "org-1", input);

    expect(tx.productStock.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ quantity: { gte: 1 } }),
        data: { quantity: { decrement: 1 } },
      }),
    );
    expect(tx.looseStock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          priceKgPriceId: "cell-1",
          branchId: "b-1",
          quantity: 15,
          organizationId: "org-1",
        }),
      }),
    );
    expect(result.quantity).toBe(15);
    expect(result.brandId).toBe("b-1");
    expect(result.typeId).toBe("t-1");
  });

  it("abre una bolsa con LooseStock existente: incrementa los kg en vez de crear", async () => {
    const tx = makeTx();
    tx.product.findFirst.mockResolvedValue(productRow);
    tx.priceKgPrice.findFirst.mockResolvedValue(cellRow);
    tx.productStock.updateMany.mockResolvedValue({ count: 1 });
    tx.looseStock.findFirst
      .mockResolvedValueOnce({ id: "ls-1", priceKgPriceId: "cell-1", branchId: "b-1" })
      .mockResolvedValueOnce({
        id: "ls-1",
        priceKgPriceId: "cell-1",
        branchId: "b-1",
        quantity: 30,
        organizationId: "org-1",
      });

    await openBag(tx, "org-1", input);

    expect(tx.looseStock.create).not.toHaveBeenCalled();
    expect(tx.looseStock.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "ls-1" }),
        data: { quantity: { increment: 15 } },
      }),
    );
  });
});
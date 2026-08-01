import { Request, Response } from "express";
import { prisma, basePrisma } from "../../src/config/db";
import { syncHqStock } from "../../src/services/stockService";
import productController from "../../src/controllers/productController";

// Mocks: config/db (prisma + basePrisma), tenantContext (org fija) y
// stockService (syncHqStock se espía; canEditBranchStock queda REAL — es pura,
// su lógica de rol/assignments ya está cubierta en stockService.test.ts).
jest.mock("../../src/config/db", () => ({
  prisma: {
    product: { findFirst: jest.fn() },
    branch: { findFirst: jest.fn(), findMany: jest.fn() },
    productStock: { findMany: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
  },
  basePrisma: {
    branchAssignment: { findMany: jest.fn() },
  },
}));

jest.mock("../../src/config/tenantContext", () => ({
  requireOrganizationId: jest.fn().mockReturnValue("org-1"),
}));

jest.mock("../../src/services/stockService", () => {
  const actual = jest.requireActual("../../src/services/stockService");
  return { ...actual, syncHqStock: jest.fn() };
});

const mockedPrisma = prisma as unknown as {
  product: { findFirst: jest.Mock };
  branch: { findFirst: jest.Mock; findMany: jest.Mock };
  productStock: { findMany: jest.Mock; updateMany: jest.Mock; create: jest.Mock };
};
const mockedBasePrisma = basePrisma as unknown as {
  branchAssignment: { findMany: jest.Mock };
};
const mockedSyncHqStock = syncHqStock as jest.Mock;

const mockRequest = (params: any, user: any, body?: any) =>
  ({ params, user, body } as unknown as Request);
const mockResponse = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

// Sucursales ACTIVAS de la org (la DB ya aplica el filtro isActive:true; la
// exclusión de inactivas se verifica por el `where` abajo y contra la DB real
// en el e2e).
const branches = [
  { id: "b-hq", name: "Casa Central", isHeadquarters: true },
  { id: "b-2", name: "Sucursal 2", isHeadquarters: false },
];

describe("productController.getProductStock (A1)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("404 cuando el producto no existe en la org (producto de otra org incluido)", async () => {
    mockedPrisma.product.findFirst.mockResolvedValue(null);

    const req = mockRequest({ id: "prod-otra-org" }, { id: "u-admin", role: "ADMIN" });
    const res = mockResponse();

    await productController.getProductStock(req, res);

    expect(mockedPrisma.product.findFirst).toHaveBeenCalledWith({
      where: { id: "prod-otra-org" },
      select: { id: true },
    });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: "Producto no encontrado" });
  });

  it("200 con todas las sucursales ACTIVAS, stock merge y canEdit=true para ADMIN", async () => {
    mockedPrisma.product.findFirst.mockResolvedValue({ id: "prod-1" });
    // La DB ya filtra isActive=true (assert abajo): el mock solo devuelve activas.
    mockedPrisma.branch.findMany.mockResolvedValue(branches.slice(0, 2));
    mockedPrisma.productStock.findMany.mockResolvedValue([
      { branchId: "b-hq", quantity: 10 },
      { branchId: "b-2", quantity: 3 },
    ]);
    mockedBasePrisma.branchAssignment.findMany.mockResolvedValue([]);

    const req = mockRequest({ id: "prod-1" }, { id: "u-admin", role: "ADMIN" });
    const res = mockResponse();

    await productController.getProductStock(req, res);

    // La exclusión de la sucursal inactiva la garantiza el filtro isActive:true
    // (spec A1: "todas las sucursales activas").
    expect(mockedPrisma.branch.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      select: { id: true, name: true, isHeadquarters: true },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.productId).toBe("prod-1");
    expect(payload.branches).toHaveLength(2);

    const hq = payload.branches.find((b: any) => b.branchId === "b-hq");
    expect(hq).toEqual({
      branchId: "b-hq",
      branchName: "Casa Central",
      quantity: 10,
      isHeadquarters: true,
      canEdit: true,
    });
    const s2 = payload.branches.find((b: any) => b.branchId === "b-2");
    expect(s2).toEqual({
      branchId: "b-2",
      branchName: "Sucursal 2",
      quantity: 3,
      isHeadquarters: false,
      canEdit: true,
    });
  });

  it("vendedor: canEdit solo en SU sucursal asignada (branchIds leídos de DB) y stock sin fila → 0", async () => {
    mockedPrisma.product.findFirst.mockResolvedValue({ id: "prod-1" });
    mockedPrisma.branch.findMany.mockResolvedValue(branches.slice(0, 2));
    // Solo HQ tiene fila de stock: la sucursal 2 no tiene → quantity debe ser 0.
    mockedPrisma.productStock.findMany.mockResolvedValue([
      { branchId: "b-hq", quantity: 10 },
    ]);
    mockedBasePrisma.branchAssignment.findMany.mockResolvedValue([
      { branchId: "b-2" },
    ]);

    const req = mockRequest({ id: "prod-1" }, { id: "u-vendedor", role: "VENDEDOR" });
    const res = mockResponse();

    await productController.getProductStock(req, res);

    expect(mockedBasePrisma.branchAssignment.findMany).toHaveBeenCalledWith({
      where: { userId: "u-vendedor" },
      select: { branchId: true },
    });
    const payload = res.json.mock.calls[0][0];
    const hq = payload.branches.find((b: any) => b.branchId === "b-hq");
    const s2 = payload.branches.find((b: any) => b.branchId === "b-2");
    expect(hq.canEdit).toBe(false);
    expect(s2.canEdit).toBe(true);
    expect(s2.quantity).toBe(0); // stock implícito 0
  });

  it("employee: todas las sucursales en solo lectura aunque tenga asignación", async () => {
    mockedPrisma.product.findFirst.mockResolvedValue({ id: "prod-1" });
    mockedPrisma.branch.findMany.mockResolvedValue(branches.slice(0, 2));
    mockedPrisma.productStock.findMany.mockResolvedValue([
      { branchId: "b-hq", quantity: 10 },
    ]);
    mockedBasePrisma.branchAssignment.findMany.mockResolvedValue([
      { branchId: "b-hq" },
    ]);

    const req = mockRequest({ id: "prod-1" }, { id: "u-employee", role: "EMPLOYEE" });
    const res = mockResponse();

    await productController.getProductStock(req, res);

    const payload = res.json.mock.calls[0][0];
    for (const b of payload.branches) {
      expect(b.canEdit).toBe(false);
    }
  });
});

describe("productController.updateBranchStock (A2/D4)", () => {
  const hqBranch = { id: "b-hq", isHeadquarters: true };
  const s2Branch = { id: "b-2", isHeadquarters: false };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("404 si el producto no existe en la org (cross-org)", async () => {
    mockedPrisma.product.findFirst.mockResolvedValue(null);

    const req = mockRequest({ id: "prod-otra-org", branchId: "b-hq" }, { id: "u-admin", role: "ADMIN" }, { quantity: 5 });
    const res = mockResponse();

    await productController.updateBranchStock(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockedPrisma.productStock.updateMany).not.toHaveBeenCalled();
  });

  it("404 si la sucursal no existe o está inactiva (cross-org)", async () => {
    mockedPrisma.product.findFirst.mockResolvedValue({ id: "prod-1" });
    mockedPrisma.branch.findFirst.mockResolvedValue(null);

    const req = mockRequest({ id: "prod-1", branchId: "b-otra-org" }, { id: "u-admin", role: "ADMIN" }, { quantity: 5 });
    const res = mockResponse();

    await productController.updateBranchStock(req, res);

    expect(mockedPrisma.branch.findFirst).toHaveBeenCalledWith({
      where: { id: "b-otra-org", isActive: true },
      select: { id: true, isHeadquarters: true },
    });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: "Sucursal no encontrada" });
  });

  it("403 employee: nunca edita, aunque tenga asignación", async () => {
    mockedPrisma.product.findFirst.mockResolvedValue({ id: "prod-1" });
    mockedPrisma.branch.findFirst.mockResolvedValue(s2Branch);
    mockedBasePrisma.branchAssignment.findMany.mockResolvedValue([{ branchId: "b-2" }]);

    const req = mockRequest({ id: "prod-1", branchId: "b-2" }, { id: "u-employee", role: "EMPLOYEE" }, { quantity: 5 });
    const res = mockResponse();

    await productController.updateBranchStock(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockedPrisma.productStock.updateMany).not.toHaveBeenCalled();
    expect(mockedPrisma.productStock.create).not.toHaveBeenCalled();
  });

  it("403 vendedor en sucursal que no es suya — BranchAssignment re-leído de DB en CADA PUT (spec A2/D3)", async () => {
    mockedPrisma.product.findFirst.mockResolvedValue({ id: "prod-1" });
    mockedPrisma.branch.findFirst.mockResolvedValue(hqBranch);
    mockedBasePrisma.branchAssignment.findMany.mockResolvedValue([{ branchId: "b-2" }]);

    const req = mockRequest({ id: "prod-1", branchId: "b-hq" }, { id: "u-vendedor", role: "VENDEDOR" }, { quantity: 5 });
    const res = mockResponse();

    await productController.updateBranchStock(req, res);

    expect(mockedBasePrisma.branchAssignment.findMany).toHaveBeenCalledWith({
      where: { userId: "u-vendedor" },
      select: { branchId: true },
    });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockedPrisma.productStock.updateMany).not.toHaveBeenCalled();
  });

  it("admin: 200 en sucursal no-HQ — updateMany sin create y SIN tocar Product.quantity (D4)", async () => {
    mockedPrisma.product.findFirst.mockResolvedValue({ id: "prod-1" });
    mockedPrisma.branch.findFirst.mockResolvedValue(s2Branch);
    mockedBasePrisma.branchAssignment.findMany.mockResolvedValue([]);
    mockedPrisma.productStock.updateMany.mockResolvedValue({ count: 1 });

    const req = mockRequest({ id: "prod-1", branchId: "b-2" }, { id: "u-admin", role: "ADMIN" }, { quantity: 7 });
    const res = mockResponse();

    await productController.updateBranchStock(req, res);

    expect(mockedPrisma.productStock.updateMany).toHaveBeenCalledWith({
      where: { productId: "prod-1", branchId: "b-2" },
      data: { quantity: 7 },
    });
    expect(mockedPrisma.productStock.create).not.toHaveBeenCalled();
    expect(mockedSyncHqStock).not.toHaveBeenCalled(); // no-HQ NO sincroniza Product.quantity
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "Stock actualizado",
      branchId: "b-2",
      quantity: 7,
    });
  });

  it("admin sobre HQ: 200 + syncHqStock sincroniza Product.quantity legacy (D4)", async () => {
    mockedPrisma.product.findFirst.mockResolvedValue({ id: "prod-1" });
    mockedPrisma.branch.findFirst.mockResolvedValue(hqBranch);
    mockedBasePrisma.branchAssignment.findMany.mockResolvedValue([]);
    mockedPrisma.productStock.updateMany.mockResolvedValue({ count: 1 });

    const req = mockRequest({ id: "prod-1", branchId: "b-hq" }, { id: "u-admin", role: "ADMIN" }, { quantity: 25 });
    const res = mockResponse();

    await productController.updateBranchStock(req, res);

    expect(mockedSyncHqStock).toHaveBeenCalledWith("org-1", "prod-1", 25);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("create-on-first-write: updateMany count 0 → se crea la fila de stock (sucursal sin fila previa)", async () => {
    mockedPrisma.product.findFirst.mockResolvedValue({ id: "prod-1" });
    mockedPrisma.branch.findFirst.mockResolvedValue(s2Branch);
    mockedBasePrisma.branchAssignment.findMany.mockResolvedValue([]);
    mockedPrisma.productStock.updateMany.mockResolvedValue({ count: 0 });

    const req = mockRequest({ id: "prod-1", branchId: "b-2" }, { id: "u-admin", role: "ADMIN" }, { quantity: 4 });
    const res = mockResponse();

    await productController.updateBranchStock(req, res);

    expect(mockedPrisma.productStock.create).toHaveBeenCalledWith({
      data: { productId: "prod-1", branchId: "b-2", quantity: 4, organizationId: "org-1" },
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("vendedor asignado: 200 en SU sucursal (canEdit true para VENDEDOR)", async () => {
    mockedPrisma.product.findFirst.mockResolvedValue({ id: "prod-1" });
    mockedPrisma.branch.findFirst.mockResolvedValue(s2Branch);
    mockedBasePrisma.branchAssignment.findMany.mockResolvedValue([{ branchId: "b-2" }]);
    mockedPrisma.productStock.updateMany.mockResolvedValue({ count: 1 });

    const req = mockRequest({ id: "prod-1", branchId: "b-2" }, { id: "u-vendedor", role: "VENDEDOR" }, { quantity: 8 });
    const res = mockResponse();

    await productController.updateBranchStock(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "Stock actualizado",
      branchId: "b-2",
      quantity: 8,
    });
  });
});

import { Request, Response } from "express";
import {
  listQueue,
  approveEntry,
  rejectEntry,
  autoApply,
  listProductsForCell,
} from "../../src/controllers/priceKgReviewController";
import { prisma, basePrisma } from "../../src/config/db";
import * as matchingService from "../../src/services/priceMatchingService";

jest.mock("../../src/config/db", () => ({
  prisma: {
    reviewQueueEntry: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    product: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    productStock: { findMany: jest.fn() },
    category: { findMany: jest.fn() },
    priceKgBrand: { findMany: jest.fn() },
    priceKgType: { findMany: jest.fn() },
    $transaction: jest.fn(),
  },
  basePrisma: {
    branchAssignment: { findMany: jest.fn() },
  },
}));

jest.mock("../../src/config/tenantContext", () => ({
  requireOrganizationId: jest.fn().mockReturnValue("org-1"),
}));

jest.mock("../../src/services/priceMatchingService", () => ({
  findAlimentoSecoCategoryIds: jest.fn(),
  matchProductsForCell: jest.fn(),
  autoApply: jest.fn(),
}));

const mockedPrisma = prisma as unknown as {
  reviewQueueEntry: {
    findMany: jest.Mock;
    count: jest.Mock;
    findFirst: jest.Mock;
    updateMany: jest.Mock;
    create: jest.Mock;
  };
  product: { findMany: jest.Mock; updateMany: jest.Mock };
  productStock: { findMany: jest.Mock };
  category: { findMany: jest.Mock };
  priceKgBrand: { findMany: jest.Mock };
  priceKgType: { findMany: jest.Mock };
  $transaction: jest.Mock;
};
const mockedBasePrisma = basePrisma as unknown as {
  branchAssignment: { findMany: jest.Mock };
};
const mockedMatching = matchingService as jest.Mocked<typeof matchingService>;

const mockTx = () => ({
  reviewQueueEntry: {
    findFirst: jest.fn(),
    updateMany: jest.fn(),
  },
  product: { updateMany: jest.fn() },
});

const mockRequest = (query: any = {}, params: any = {}, user: any = {}) =>
  ({ query, params, user } as unknown as Request);

const mockResponse = () => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const ENTRY = {
  id: "e1",
  productId: "p1",
  priceKgPriceId: "c1",
  species: "PERRO",
  reason: "FUZZY_MATCH",
  status: "PENDING",
  oldPriceKg: 7500,
  newPriceKg: 9200,
  reviewedBy: null,
  appliedAt: null,
  createdAt: new Date("2026-08-01T10:00:00Z"),
  product: { name: "PRO PLAN ADULTO PERRO 12KG" },
  priceKgPrice: {
    brand: { name: "PRO PLAN" },
    type: { name: "Adulto" },
  },
};

describe("PriceKgReview Controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedBasePrisma.branchAssignment.findMany.mockResolvedValue([]);
  });

  describe("listQueue", () => {
    it("lista entradas org-scoped con filtro status y paginación", async () => {
      mockedPrisma.reviewQueueEntry.findMany.mockResolvedValue([ENTRY]);
      mockedPrisma.reviewQueueEntry.count.mockResolvedValue(1);

      const req = mockRequest({ status: "PENDING", page: "2", limit: "10" });
      const res = mockResponse();
      await listQueue(req, res);

      expect(mockedPrisma.reviewQueueEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: "PENDING" }, // organizationId inyectado por la extensión
          skip: 10,
          take: 10,
        }),
      );
      expect(mockedPrisma.reviewQueueEntry.count).toHaveBeenCalledWith({
        where: { status: "PENDING" },
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [
            expect.objectContaining({
              id: "e1",
              productName: "PRO PLAN ADULTO PERRO 12KG",
              brandName: "PRO PLAN",
              typeName: "Adulto",
              reason: "FUZZY_MATCH",
              oldPriceKg: 7500,
              newPriceKg: 9200,
            }),
          ],
          total: 1,
          page: 2,
        }),
      );
    });

    it("agrega filtro reason cuando viene en el query", async () => {
      mockedPrisma.reviewQueueEntry.findMany.mockResolvedValue([]);
      mockedPrisma.reviewQueueEntry.count.mockResolvedValue(0);

      const req = mockRequest({ reason: "MANUAL_OVERRIDE" });
      const res = mockResponse();
      await listQueue(req, res);

      expect(mockedPrisma.reviewQueueEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { reason: "MANUAL_OVERRIDE" },
        }),
      );
    });
  });

  describe("approveEntry", () => {
    it("aprueba: aplica newPriceKg al producto y marca APPROVED sin tocar priceKgSueltoManual", async () => {
      const tx = mockTx();
      tx.reviewQueueEntry.findFirst.mockResolvedValue(ENTRY);
      tx.product.updateMany.mockResolvedValue({ count: 1 });
      tx.reviewQueueEntry.updateMany.mockResolvedValue({ count: 1 });
      mockedPrisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const req = mockRequest({}, { id: "e1" }, { id: "u1" });
      const res = mockResponse();
      await approveEntry(req, res);

      expect(tx.product.updateMany).toHaveBeenCalledWith({
        where: { id: "p1", organizationId: "org-1" },
        // SOLO priceKgSuelto: nunca toca priceKgSueltoManual (decisión 1).
        data: { priceKgSuelto: 9200 },
      });
      expect(tx.reviewQueueEntry.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "e1", organizationId: "org-1" },
          data: expect.objectContaining({ status: "APPROVED", reviewedBy: "u1" }),
        }),
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it("entrada inexistente o no PENDING → 404 sin escribir nada", async () => {
      const tx = mockTx();
      tx.reviewQueueEntry.findFirst.mockResolvedValue(null);
      mockedPrisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const req = mockRequest({}, { id: "e-x" });
      const res = mockResponse();
      await approveEntry(req, res);

      expect(tx.product.updateMany).not.toHaveBeenCalled();
      expect(tx.reviewQueueEntry.updateMany).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("error en la transacción → rollback y respuesta de error", async () => {
      mockedPrisma.$transaction.mockRejectedValue(new Error("DB error"));

      const req = mockRequest({}, { id: "e1" });
      const res = mockResponse();
      await approveEntry(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("rejectEntry", () => {
    it("rechaza: solo status REJECTED, el precio NO se toca", async () => {
      const tx = mockTx();
      tx.reviewQueueEntry.findFirst.mockResolvedValue(ENTRY);
      mockedPrisma.$transaction.mockImplementation(async (cb: any) => cb(tx));

      const req = mockRequest({}, { id: "e1" }, { id: "u1" });
      const res = mockResponse();
      await rejectEntry(req, res);

      expect(tx.product.updateMany).not.toHaveBeenCalled();
      expect(tx.reviewQueueEntry.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "e1", organizationId: "org-1" },
          data: expect.objectContaining({ status: "REJECTED", reviewedBy: "u1" }),
        }),
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });
  });

  describe("autoApply", () => {
    it("corre en $transaction y devuelve {applied, queued, skipped}", async () => {
      mockedPrisma.$transaction.mockImplementation(async (cb: any) =>
        cb(mockTx()),
      );
      mockedMatching.autoApply.mockResolvedValue({ applied: 5, queued: 3, skipped: 2 });

      const req = mockRequest();
      const res = mockResponse();
      await autoApply(req, res);

      expect(mockedPrisma.$transaction).toHaveBeenCalledWith(expect.any(Function));
      expect(mockedMatching.autoApply).toHaveBeenCalledWith(
        expect.anything(),
        "org-1",
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ applied: 5, queued: 3, skipped: 2 });
    });
  });

  describe("listProductsForCell", () => {
    const categories = [
      { id: "alimento", name: "Alimento Seco", parentId: null },
      { id: "cat-perro", name: "Perro", parentId: "alimento" },
    ];
    const products = [
      {
        id: "p1",
        name: "PRO PLAN ADULTO PERRO 12KG",
        categoryId: "cat-perro",
        weightKg: 12,
        priceKgSuelto: 8500,
        quantity: 5,
        category: { name: "Alimento Seco Perro" },
      },
      {
        id: "p2",
        name: "OTRA COSA ADULTO PERRO",
        categoryId: "cat-perro",
        weightKg: 15,
        priceKgSuelto: 7000,
        quantity: 3,
        category: { name: "Alimento Seco Perro" },
      },
    ];

    it("filtra por brandId+typeId+species y devuelve solo los que matchean la celda", async () => {
      mockedPrisma.category.findMany.mockResolvedValue(categories);
      mockedPrisma.priceKgBrand.findMany.mockResolvedValue([]);
      mockedPrisma.priceKgType.findMany.mockResolvedValue([]);
      mockedPrisma.product.findMany.mockResolvedValue(products);
      mockedMatching.findAlimentoSecoCategoryIds.mockReturnValue(["cat-perro"]);
      mockedMatching.matchProductsForCell.mockReturnValue([
        { product: products[0], exact: true },
      ]);

      const req = mockRequest({
        brandId: "b-proplan",
        typeId: "t-adulto",
        species: "PERRO",
      });
      const res = mockResponse();
      await listProductsForCell(req, res);

      // Queries org-scoped (la extensión inyecta organizationId).
      expect(mockedPrisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: "org-1" } }),
      );
      expect(mockedPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: "org-1" }),
        }),
      );
      expect(mockedMatching.matchProductsForCell).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        { brandId: "b-proplan", typeId: "t-adulto", species: "PERRO" },
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith([
        expect.objectContaining({
          id: "p1",
          name: "PRO PLAN ADULTO PERRO 12KG",
          weightKg: 12,
          stock: 5, // stock legacy (rol sin sucursal)
          priceKgSuelto: 8500,
          category: "Alimento Seco Perro",
        }),
      ]);
    });

    it("parámetros inválidos → 400", async () => {
      const req = mockRequest({ brandId: "b1", typeId: "t1", species: "RARO" });
      const res = mockResponse();
      await listProductsForCell(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockedPrisma.product.findMany).not.toHaveBeenCalled();
    });
  });
});

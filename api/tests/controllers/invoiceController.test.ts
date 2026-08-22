import { Request, Response } from "express";
import { prisma } from "../../src/config/db";
import invoiceController from "../../src/controllers/invoiceController";

jest.mock("../../src/config/db", () => ({
  prisma: {
    invoice: { findFirst: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
    customer: { findFirst: jest.fn() },
    branch: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  },
  basePrisma: {},
}));

jest.mock("../../src/config/tenantContext", () => ({
  requireOrganizationId: jest.fn().mockReturnValue("org-1"),
}));

jest.mock("../../src/services/fiscalInvoiceService", () => ({
  emitirFiscalmente: jest.fn(),
  reintentarFiscalmente: jest.fn(),
}));

jest.mock("../../src/integrations/arca/arcaClient", () => ({
  createArcaClientHomo: jest.fn(),
}));

const mockedPrisma = prisma as unknown as {
  invoice: { findFirst: jest.Mock; updateMany: jest.Mock; create: jest.Mock };
  customer: { findFirst: jest.Mock };
  branch: { findFirst: jest.Mock };
  $transaction: jest.Mock;
};

const mockRequest = (params: any) => ({ params } as unknown as Request);
const mockResponse = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const makeInvoice = (overrides: any = {}) => ({
  id: "inv-1",
  status: "ISSUED",
  cae: null,
  caeVencimiento: null,
  paymentStatus: "PENDING",
  dueDate: null,
  number: "FAC-0001",
  ...overrides,
});

describe("invoiceController.cancelInvoice", () => {
  beforeEach(() => jest.clearAllMocks());

  it("cancela una ISSUED sin CAE → CANCELLED conservando el number", async () => {
    const invoice = makeInvoice();
    mockedPrisma.invoice.findFirst
      .mockResolvedValueOnce(invoice)
      .mockResolvedValueOnce({ ...invoice, status: "CANCELLED" });

    const res = mockResponse();
    await invoiceController.cancelInvoice(mockRequest({ id: "inv-1" }), res);

    expect(mockedPrisma.invoice.updateMany).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: { status: "CANCELLED" },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].status).toBe("CANCELLED");
  });

  it("rechaza cancelar una factura ISSUED con CAE → 409", async () => {
    mockedPrisma.invoice.findFirst.mockResolvedValueOnce(
      makeInvoice({ cae: "72431470192419", caeVencimiento: new Date("2026-08-25") }),
    );

    const res = mockResponse();
    await invoiceController.cancelInvoice(mockRequest({ id: "inv-1" }), res);

    expect(mockedPrisma.invoice.updateMany).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].message).toMatch(/CAE/i);
  });

  it("rechaza cancelar una factura que no es ISSUED → 400", async () => {
    mockedPrisma.invoice.findFirst.mockResolvedValueOnce(makeInvoice({ status: "DRAFT" }));

    const res = mockResponse();
    await invoiceController.cancelInvoice(mockRequest({ id: "inv-1" }), res);

    expect(mockedPrisma.invoice.updateMany).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("404 si la factura no existe", async () => {
    mockedPrisma.invoice.findFirst.mockResolvedValueOnce(null);

    const res = mockResponse();
    await invoiceController.cancelInvoice(mockRequest({ id: "inv-1" }), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockedPrisma.invoice.updateMany).not.toHaveBeenCalled();
  });
});

describe("invoiceController.createInvoice + branchId (sdd/sucursales-pv-facturacion R3)", () => {
  beforeEach(() => jest.clearAllMocks());

  const mockRequest = (body: any) => ({ body } as unknown as Request);

  it("persiste branchId y el include agrega branch (R3)", async () => {
    mockedPrisma.customer.findFirst.mockResolvedValue({ id: "cust-1" });
    mockedPrisma.branch.findFirst.mockResolvedValue({ id: "b-1", name: "Centro" });
    mockedPrisma.invoice.create.mockResolvedValue({
      id: "inv-1",
      status: "DRAFT",
      customerId: "cust-1",
      branchId: "b-1",
      branch: { id: "b-1", name: "Centro" },
      items: [],
    });

    const req = mockRequest({
      customerId: "cust-1",
      branchId: "b-1",
      items: [{ description: "Servicio", quantity: 1, unitPrice: 100, taxRate: 21 }],
    });
    const res = mockResponse();

    await invoiceController.createInvoice(req, res);

    expect(mockedPrisma.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ branchId: "b-1" }),
        include: expect.objectContaining({ branch: true }),
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("branchId de una sucursal que NO existe → 404", async () => {
    mockedPrisma.customer.findFirst.mockResolvedValue({ id: "cust-1" });
    mockedPrisma.branch.findFirst.mockResolvedValue(null);

    const req = mockRequest({
      customerId: "cust-1",
      branchId: "b-noexiste",
      items: [{ description: "S", quantity: 1, unitPrice: 100, taxRate: 21 }],
    });
    const res = mockResponse();

    await invoiceController.createInvoice(req, res);

    expect(mockedPrisma.invoice.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("sin branchId en el body → la factura se crea con branchId null (fallback)", async () => {
    mockedPrisma.customer.findFirst.mockResolvedValue({ id: "cust-1" });
    mockedPrisma.invoice.create.mockResolvedValue({
      id: "inv-2",
      status: "DRAFT",
      customerId: "cust-1",
      branchId: null,
      items: [],
    });

    const req = mockRequest({
      customerId: "cust-1",
      items: [{ description: "S", quantity: 1, unitPrice: 100, taxRate: 21 }],
    });
    const res = mockResponse();

    await invoiceController.createInvoice(req, res);

    expect(mockedPrisma.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ branchId: null }),
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

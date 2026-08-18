import { Request, Response } from "express";
import { prisma } from "../../src/config/db";
import invoiceController from "../../src/controllers/invoiceController";

jest.mock("../../src/config/db", () => ({
  prisma: {
    invoice: { findFirst: jest.fn(), updateMany: jest.fn() },
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
  invoice: { findFirst: jest.Mock; updateMany: jest.Mock };
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

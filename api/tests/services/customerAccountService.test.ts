/**
 * Unit tests — customerAccountService (cuenta-corriente T3).
 * Saldo = Σ CHARGE − Σ PAYMENT por agregación; cobranza con validaciones
 * (sobrepago, cliente de la org, caja abierta si es EFECTIVO) dentro de una
 * transacción que re-chequea el saldo.
 */
import customerAccountService from "../../src/services/customerAccountService";
import { prisma, basePrisma } from "../../src/config/db";
import { sendDocument, normalizePhone } from "../../src/services/whatsappService";
import { uploadToR2 } from "../../src/config/storage";
import { buildAccountStatementPdf } from "../../src/services/accountStatementPdf";

jest.mock("../../src/config/db", () => ({
  prisma: {
    customer: { findFirst: jest.fn(), findMany: jest.fn() },
    cashSession: { findFirst: jest.fn() },
    customerAccountMovement: { findMany: jest.fn(), groupBy: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
  },
  // StoreSettings/Organization NO son TENANT_MODELS (ver db.ts) → se leen con
  // basePrisma, scopeando por organizationId a mano (T1 — comprobante PDF).
  basePrisma: {
    organization: { findUnique: jest.fn() },
    storeSettings: { findUnique: jest.fn() },
  },
}));

jest.mock("../../src/config/tenantContext", () => ({
  requireOrganizationId: jest.fn().mockReturnValue("org-1"),
}));

jest.mock("../../src/services/whatsappService", () => ({
  sendDocument: jest.fn(),
  normalizePhone: jest.fn(),
}));

jest.mock("../../src/config/storage", () => ({
  uploadToR2: jest.fn(),
}));

jest.mock("../../src/services/accountStatementPdf", () => ({
  buildAccountStatementPdf: jest.fn(),
}));

const p = prisma as unknown as {
  customer: { findFirst: jest.Mock; findMany: jest.Mock };
  cashSession: { findFirst: jest.Mock };
  customerAccountMovement: { findMany: jest.Mock; groupBy: jest.Mock; create: jest.Mock };
  $transaction: jest.Mock;
};

const bp = basePrisma as unknown as {
  organization: { findUnique: jest.Mock };
  storeSettings: { findUnique: jest.Mock };
};

const wa = { sendDocument: sendDocument as jest.Mock, normalizePhone: normalizePhone as jest.Mock };
const r2 = uploadToR2 as jest.Mock;
const pdfBuilder = buildAccountStatementPdf as jest.Mock;

const makeTx = () => ({
  $queryRaw: jest.fn().mockResolvedValue([]),
  customerAccountMovement: { groupBy: jest.fn(), create: jest.fn() },
});

const sums = (charge: number | null, payment: number | null) => [
  ...(charge === null ? [] : [{ type: "CHARGE", _sum: { amount: charge } }]),
  ...(payment === null ? [] : [{ type: "PAYMENT", _sum: { amount: payment } }]),
];

describe("customerAccountService.getBalances", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns only customers with balance != 0 (Σ CHARGE − Σ PAYMENT), scoped to the org", async () => {
    p.customerAccountMovement.groupBy.mockResolvedValue([
      { customerId: "c-1", type: "CHARGE", _sum: { amount: 300 } },
      { customerId: "c-1", type: "PAYMENT", _sum: { amount: 100 } },
      { customerId: "c-2", type: "CHARGE", _sum: { amount: 50 } },
      { customerId: "c-2", type: "PAYMENT", _sum: { amount: 50 } }, // saldado
      { customerId: "c-3", type: "PAYMENT", _sum: { amount: 20 } }, // a favor
    ]);
    p.customer.findMany.mockResolvedValue([
      { id: "c-1", name: "Ana" },
      { id: "c-3", name: "Beto" },
    ]);

    const result = await customerAccountService.getBalances();

    expect(p.customerAccountMovement.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ["customerId", "type"],
        where: { organizationId: "org-1" },
      }),
    );
    expect(result).toEqual([
      { customerId: "c-1", name: "Ana", balance: 200 },
      { customerId: "c-3", name: "Beto", balance: -20 },
    ]);
  });

  it("uses the fallback label \"Sin nombre\" for customers without a name", async () => {
    p.customerAccountMovement.groupBy.mockResolvedValue([
      { customerId: "c-1", type: "CHARGE", _sum: { amount: 100 } },
      { customerId: "c-2", type: "CHARGE", _sum: { amount: 50 } },
    ]);
    p.customer.findMany.mockResolvedValue([
      { id: "c-1", name: null },
      { id: "c-2", name: "Ana" },
    ]);

    const result = await customerAccountService.getBalances();

    expect(result).toEqual([
      { customerId: "c-2", name: "Ana", balance: 50 },
      { customerId: "c-1", name: "Sin nombre", balance: 100 },
    ]);
  });

  it("returns [] without querying customers when nobody has movements", async () => {
    p.customerAccountMovement.groupBy.mockResolvedValue([]);
    const result = await customerAccountService.getBalances();
    expect(result).toEqual([]);
    expect(p.customer.findMany).not.toHaveBeenCalled();
  });
});

describe("customerAccountService.getAccount", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns customer, balance and movements newest first with the sale reference", async () => {
    p.customer.findFirst.mockResolvedValue({ id: "c-1", name: "Ana", email: "a@a.com" });
    p.customerAccountMovement.groupBy.mockResolvedValue(sums(300, 100));
    const movements = [
      { id: "m-2", type: "PAYMENT", amount: 100, sale: null },
      {
        id: "m-1",
        type: "CHARGE",
        amount: 300,
        saleId: "s-1",
        sale: { id: "s-1", saleDate: new Date() },
      },
    ];
    p.customerAccountMovement.findMany.mockResolvedValue(movements);

    const result = await customerAccountService.getAccount("c-1");

    expect(p.customerAccountMovement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { customerId: "c-1" },
        orderBy: { createdAt: "desc" },
        include: { sale: { select: { id: true, saleDate: true } } },
      }),
    );
    expect(result).toEqual({
      customer: { id: "c-1", name: "Ana" },
      balance: 200,
      movements,
    });
  });

  it("returns the fallback name \"Sin nombre\" when the customer has no name", async () => {
    p.customer.findFirst.mockResolvedValue({ id: "c-1", name: null, email: null });
    p.customerAccountMovement.groupBy.mockResolvedValue(sums(10, 0));
    p.customerAccountMovement.findMany.mockResolvedValue([]);

    const result = await customerAccountService.getAccount("c-1");

    expect(result.customer).toEqual({ id: "c-1", name: "Sin nombre" });
  });

  it("unknown / other-org customer → CUSTOMER_NOT_FOUND", async () => {
    p.customer.findFirst.mockResolvedValue(null);
    await expect(customerAccountService.getAccount("nope")).rejects.toMatchObject({
      code: "CUSTOMER_NOT_FOUND",
    });
  });
});

describe("customerAccountService.registerPayment", () => {
  let tx: ReturnType<typeof makeTx>;
  beforeEach(() => {
    jest.clearAllMocks();
    tx = makeTx();
    p.$transaction.mockImplementation((cb: any) => cb(tx));
    p.customer.findFirst.mockResolvedValue({ id: "c-1", name: "Ana" });
    tx.customerAccountMovement.groupBy.mockResolvedValue(sums(300, 100)); // saldo 200
    tx.customerAccountMovement.create.mockImplementation(async ({ data }: any) => ({
      id: "m-9",
      ...data,
    }));
  });

  it("TRANSFERENCIA: creates a PAYMENT movement (no cash session) and returns the new balance", async () => {
    const result = await customerAccountService.registerPayment(
      "c-1",
      { amount: 50, method: "TRANSFERENCIA", note: "  ref 123 " },
      "u-1",
    );

    expect(tx.customerAccountMovement.create).toHaveBeenCalledWith({
      data: {
        organizationId: "org-1",
        customerId: "c-1",
        type: "PAYMENT",
        amount: 50,
        method: "TRANSFERENCIA",
        cashSessionId: null,
        note: "ref 123",
        createdById: "u-1",
      },
    });
    expect(result.balance).toBe(150);
    expect(result.movement).toMatchObject({ id: "m-9", type: "PAYMENT" });
    expect(p.cashSession.findFirst).not.toHaveBeenCalled();
  });

  it("re-checks the balance inside the transaction, locking the customer row", async () => {
    await customerAccountService.registerPayment("c-1", { amount: 10, method: "QR" }, "u-1");
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.customerAccountMovement.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { customerId: "c-1", organizationId: "org-1" } }),
    );
  });

  it("paying exactly the balance is allowed (balance becomes 0)", async () => {
    const result = await customerAccountService.registerPayment(
      "c-1",
      { amount: 200, method: "QR" },
      "u-1",
    );
    expect(result.balance).toBe(0);
  });

  it("overpayment → PAYMENT_EXCEEDS_BALANCE, nothing created", async () => {
    await expect(
      customerAccountService.registerPayment("c-1", { amount: 200.01, method: "QR" }, "u-1"),
    ).rejects.toMatchObject({
      code: "PAYMENT_EXCEEDS_BALANCE",
      message: expect.stringContaining("saldo"),
    });
    expect(tx.customerAccountMovement.create).not.toHaveBeenCalled();
  });

  it("customer with no debt cannot receive a payment", async () => {
    tx.customerAccountMovement.groupBy.mockResolvedValue([]);
    await expect(
      customerAccountService.registerPayment("c-1", { amount: 1, method: "QR" }, "u-1"),
    ).rejects.toMatchObject({ code: "PAYMENT_EXCEEDS_BALANCE" });
  });

  it("unknown / other-org customer → CUSTOMER_NOT_FOUND (no transaction)", async () => {
    p.customer.findFirst.mockResolvedValue(null);
    await expect(
      customerAccountService.registerPayment("nope", { amount: 1, method: "QR" }, "u-1"),
    ).rejects.toMatchObject({ code: "CUSTOMER_NOT_FOUND" });
    expect(p.$transaction).not.toHaveBeenCalled();
  });

  it("CUENTA_CORRIENTE is not a valid collection method", async () => {
    await expect(
      customerAccountService.registerPayment(
        "c-1",
        { amount: 1, method: "CUENTA_CORRIENTE" as any },
        "u-1",
      ),
    ).rejects.toMatchObject({ code: "INVALID_PAYMENT_METHOD" });
  });

  it("EFECTIVO without cashSessionId → CASH_SESSION_REQUIRED", async () => {
    await expect(
      customerAccountService.registerPayment("c-1", { amount: 10, method: "EFECTIVO" }, "u-1"),
    ).rejects.toMatchObject({ code: "CASH_SESSION_REQUIRED" });
    expect(tx.customerAccountMovement.create).not.toHaveBeenCalled();
  });

  it("EFECTIVO with a closed / other-org cash session → CASH_SESSION_REQUIRED", async () => {
    p.cashSession.findFirst.mockResolvedValue(null);
    await expect(
      customerAccountService.registerPayment(
        "c-1",
        { amount: 10, method: "EFECTIVO", cashSessionId: "cs-x" },
        "u-1",
      ),
    ).rejects.toMatchObject({ code: "CASH_SESSION_REQUIRED" });
    expect(p.cashSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cs-x", status: "OPEN" } }),
    );
  });

  it("EFECTIVO with an OPEN session stores method + cashSessionId", async () => {
    p.cashSession.findFirst.mockResolvedValue({ id: "cs-1" });
    await customerAccountService.registerPayment(
      "c-1",
      { amount: 80, method: "EFECTIVO", cashSessionId: "cs-1" },
      "u-1",
    );
    expect(tx.customerAccountMovement.create.mock.calls[0][0].data).toMatchObject({
      method: "EFECTIVO",
      cashSessionId: "cs-1",
      amount: 80,
    });
  });

  it("non-cash methods ignore a stray cashSessionId (not stored, not looked up)", async () => {
    await customerAccountService.registerPayment(
      "c-1",
      { amount: 10, method: "TARJETA_DEBITO", cashSessionId: "cs-1" },
      "u-1",
    );
    expect(p.cashSession.findFirst).not.toHaveBeenCalled();
    expect(tx.customerAccountMovement.create.mock.calls[0][0].data.cashSessionId).toBeNull();
  });
});

describe("customerAccountService.registerHistoricalCharge", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    p.customer.findFirst.mockResolvedValue({ id: "c-1" });
  });

  it("creates a CHARGE without sale, with the given date, note and creator; returns movement + new balance", async () => {
    const created = { id: "m-1", type: "CHARGE", amount: 800 };
    p.customerAccountMovement.create.mockResolvedValue(created);
    p.customerAccountMovement.groupBy.mockResolvedValue(sums(1300, 500));
    const date = new Date("2025-06-01T00:00:00Z");

    const result = await customerAccountService.registerHistoricalCharge(
      "c-1",
      { amount: 800, date, note: "  ventas 2025 " },
      "u-1",
    );

    expect(p.customer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "c-1" } }),
    );
    expect(p.customerAccountMovement.create).toHaveBeenCalledWith({
      data: {
        organizationId: "org-1",
        customerId: "c-1",
        type: "CHARGE",
        amount: 800,
        saleId: null,
        note: "ventas 2025",
        createdAt: date,
        createdById: "u-1",
      },
    });
    expect(result).toEqual({ movement: created, balance: 800 });
  });

  it("defaults the date to now (createdAt omitted) and empty note to null", async () => {
    p.customerAccountMovement.create.mockResolvedValue({ id: "m-2" });
    p.customerAccountMovement.groupBy.mockResolvedValue(sums(10, null));

    await customerAccountService.registerHistoricalCharge("c-1", { amount: 10, note: "  " });

    const data = p.customerAccountMovement.create.mock.calls[0][0].data;
    expect(data.note).toBeNull();
    expect(data.createdAt).toBeUndefined();
    expect(data.saleId).toBeNull();
  });

  it("unknown / other-org customer → CUSTOMER_NOT_FOUND, nothing is written", async () => {
    p.customer.findFirst.mockResolvedValue(null);
    await expect(
      customerAccountService.registerHistoricalCharge("nope", { amount: 10 }),
    ).rejects.toMatchObject({ code: "CUSTOMER_NOT_FOUND" });
    expect(p.customerAccountMovement.create).not.toHaveBeenCalled();
  });

  it("amount <= 0 → INVALID_CHARGE_AMOUNT", async () => {
    await expect(
      customerAccountService.registerHistoricalCharge("c-1", { amount: 0 }),
    ).rejects.toMatchObject({ code: "INVALID_CHARGE_AMOUNT" });
    expect(p.customerAccountMovement.create).not.toHaveBeenCalled();
  });
});

describe("customerAccountService.sendAccountStatementWhatsapp", () => {
  const movements = [{ id: "m-1", type: "CHARGE", amount: 100, sale: null }];
  const pdfBuffer = Buffer.from("%PDF-fake");

  beforeEach(() => {
    jest.clearAllMocks();
    p.customer.findFirst.mockResolvedValue({ id: "c-1", name: "Ana", phone: "3400 111-222" });
    p.customerAccountMovement.groupBy.mockResolvedValue(sums(100, 0));
    p.customerAccountMovement.findMany.mockResolvedValue(movements);
    bp.organization.findUnique.mockResolvedValue({
      name: "Pullstok",
      address: "Av. Siempre Viva 742",
      phone: "3400000000",
      taxId: "20304050607",
      taxCondition: "Responsable Inscripto",
    });
    bp.storeSettings.findUnique.mockResolvedValue({ logoUrl: "https://cdn.example.com/logo.png" });
    wa.normalizePhone.mockReturnValue("543400111222");
    pdfBuilder.mockResolvedValue(pdfBuffer);
    r2.mockResolvedValue("https://r2.example.com/account-statements/c-1-1.pdf");
    wa.sendDocument.mockResolvedValue(true);
  });

  it("unknown / other-org customer → CUSTOMER_NOT_FOUND (nothing else runs)", async () => {
    p.customer.findFirst.mockResolvedValue(null);
    await expect(
      customerAccountService.sendAccountStatementWhatsapp("nope"),
    ).rejects.toMatchObject({ code: "CUSTOMER_NOT_FOUND" });
    expect(wa.sendDocument).not.toHaveBeenCalled();
    expect(r2).not.toHaveBeenCalled();
  });

  it("customer without a usable phone → CUSTOMER_PHONE_REQUIRED (nothing else runs)", async () => {
    wa.normalizePhone.mockReturnValue(null);
    await expect(
      customerAccountService.sendAccountStatementWhatsapp("c-1"),
    ).rejects.toMatchObject({
      code: "CUSTOMER_PHONE_REQUIRED",
      message: expect.stringContaining("teléfono"),
    });
    expect(pdfBuilder).not.toHaveBeenCalled();
    expect(r2).not.toHaveBeenCalled();
    expect(wa.sendDocument).not.toHaveBeenCalled();
  });

  it("builds the PDF, uploads it to R2 and sends it by WhatsApp to the normalized phone", async () => {
    const result = await customerAccountService.sendAccountStatementWhatsapp("c-1");

    expect(wa.normalizePhone).toHaveBeenCalledWith("3400 111-222");
    expect(pdfBuilder).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: { name: "Ana" },
        organization: expect.objectContaining({ name: "Pullstok", taxId: "20304050607" }),
        logoUrl: "https://cdn.example.com/logo.png",
        balance: 100,
        movements,
      }),
    );
    expect(r2).toHaveBeenCalledWith(pdfBuffer, expect.any(String), "application/pdf");
    expect(wa.sendDocument).toHaveBeenCalledWith(
      "543400111222",
      "https://r2.example.com/account-statements/c-1-1.pdf",
      expect.any(String),
      expect.any(String),
    );
    expect(result).toEqual({ sent: true });
  });

  it("no StoreSettings / no logo → builds the PDF with logoUrl null (never throws)", async () => {
    bp.storeSettings.findUnique.mockResolvedValue(null);
    const result = await customerAccountService.sendAccountStatementWhatsapp("c-1");
    expect(pdfBuilder).toHaveBeenCalledWith(expect.objectContaining({ logoUrl: null }));
    expect(result).toEqual({ sent: true });
  });

  it("sendDocument returns false → WHATSAPP_SEND_FAILED", async () => {
    wa.sendDocument.mockResolvedValue(false);
    await expect(
      customerAccountService.sendAccountStatementWhatsapp("c-1"),
    ).rejects.toMatchObject({ code: "WHATSAPP_SEND_FAILED" });
  });
});

// wa.me fallback (Kapso sandbox blocks unsolicited sends): builds the PDF and
// returns its URL, WITHOUT requiring a phone or calling Kapso's sendDocument.
// Shares the PDF-build/org-lookup logic with sendAccountStatementWhatsapp.
describe("customerAccountService.getAccountStatementLink", () => {
  const movements = [{ id: "m-1", type: "CHARGE", amount: 100, sale: null }];
  const pdfBuffer = Buffer.from("%PDF-fake");

  beforeEach(() => {
    jest.clearAllMocks();
    p.customer.findFirst.mockResolvedValue({ id: "c-1", name: "Ana", phone: "3400 111-222" });
    p.customerAccountMovement.groupBy.mockResolvedValue(sums(100, 0));
    p.customerAccountMovement.findMany.mockResolvedValue(movements);
    bp.organization.findUnique.mockResolvedValue({
      name: "Pullstok",
      address: "Av. Siempre Viva 742",
      phone: "3400000000",
      taxId: "20304050607",
      taxCondition: "Responsable Inscripto",
    });
    bp.storeSettings.findUnique.mockResolvedValue({ logoUrl: "https://cdn.example.com/logo.png" });
    pdfBuilder.mockResolvedValue(pdfBuffer);
    r2.mockResolvedValue("https://r2.example.com/account-statements/c-1-1.pdf");
  });

  it("unknown / other-org customer → CUSTOMER_NOT_FOUND (nothing else runs)", async () => {
    p.customer.findFirst.mockResolvedValue(null);
    await expect(
      customerAccountService.getAccountStatementLink("nope"),
    ).rejects.toMatchObject({ code: "CUSTOMER_NOT_FOUND" });
    expect(pdfBuilder).not.toHaveBeenCalled();
    expect(r2).not.toHaveBeenCalled();
    expect(wa.sendDocument).not.toHaveBeenCalled();
  });

  it("uses \"Sin nombre\" in the PDF and filename for a customer without a name", async () => {
    p.customer.findFirst.mockResolvedValue({ id: "c-1", name: null, phone: null });

    const result = await customerAccountService.getAccountStatementLink("c-1");

    expect(pdfBuilder).toHaveBeenCalledWith(
      expect.objectContaining({ customer: { name: "Sin nombre" } }),
    );
    expect(result.filename).toBe("estado-cuenta-Sin-nombre.pdf");
  });

  it("builds the PDF and uploads it to R2 without requiring a phone or sending via WhatsApp", async () => {
    wa.normalizePhone.mockReturnValue(null); // no phone on file — must not matter here

    const result = await customerAccountService.getAccountStatementLink("c-1");

    expect(pdfBuilder).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: { name: "Ana" },
        organization: expect.objectContaining({ name: "Pullstok", taxId: "20304050607" }),
        logoUrl: "https://cdn.example.com/logo.png",
        balance: 100,
        movements,
      }),
    );
    expect(r2).toHaveBeenCalledWith(pdfBuffer, expect.any(String), "application/pdf");
    expect(wa.sendDocument).not.toHaveBeenCalled();
    expect(result).toEqual({
      url: "https://r2.example.com/account-statements/c-1-1.pdf",
      filename: expect.stringContaining("estado-cuenta-Ana"),
    });
  });
});

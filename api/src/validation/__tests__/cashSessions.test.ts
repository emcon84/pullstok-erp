/**
 * Zod schema unit tests — Cash sessions + sale payments
 * (sdd/caja-apertura-cierre). Tests schema validation in isolation (no DB).
 * Covers R1 (open), R3 (close), R6/R7 (payments structure), R8.
 */
import {
  openCashSessionSchema,
  closeCashSessionSchema,
  cashSessionQuerySchema,
  paymentSchema,
  createSaleSchema,
  createAccountPaymentSchema,
} from "../schemas";

describe("openCashSessionSchema", () => {
  it("accepts empty body (branch/openingAmount/observations optional)", () => {
    const result = openCashSessionSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts openingAmount and observations", () => {
    const result = openCashSessionSchema.safeParse({
      openingAmount: 5000,
      observations: "Fondo inicial",
    });
    expect(result.success).toBe(true);
  });

  it("accepts explicit branchId", () => {
    const result = openCashSessionSchema.safeParse({ branchId: "b-1" });
    expect(result.success).toBe(true);
  });

  it("rejects negative openingAmount", () => {
    const result = openCashSessionSchema.safeParse({ openingAmount: -5 });
    expect(result.success).toBe(false);
  });

  it("rejects a non-numeric openingAmount", () => {
    const result = openCashSessionSchema.safeParse({ openingAmount: "abc" });
    expect(result.success).toBe(false);
  });
});

describe("closeCashSessionSchema", () => {
  it("requires closingByMethod with at least one entry", () => {
    expect(closeCashSessionSchema.safeParse({}).success).toBe(false);
    expect(closeCashSessionSchema.safeParse({ closingByMethod: {} }).success).toBe(false);
  });

  it("accepts a valid closingByMethod record with closingAmount", () => {
    const result = closeCashSessionSchema.safeParse({
      closingByMethod: { EFECTIVO: 6400, TARJETA_CREDITO: 100 },
      closingAmount: 6400,
    });
    expect(result.success).toBe(true);
  });

  it("accepts closingByMethod without closingAmount", () => {
    const result = closeCashSessionSchema.safeParse({
      closingByMethod: { EFECTIVO: 6400 },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a negative closingAmount", () => {
    const result = closeCashSessionSchema.safeParse({
      closingByMethod: { EFECTIVO: 100 },
      closingAmount: -1,
    });
    expect(result.success).toBe(false);
  });
});

describe("cashSessionQuerySchema", () => {
  it("accepts optional status and branchId", () => {
    const result = cashSessionQuerySchema.safeParse({
      status: "CLOSED",
      branchId: "b-1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid status", () => {
    const result = cashSessionQuerySchema.safeParse({ status: "BOGUS" });
    expect(result.success).toBe(false);
  });

  it("accepts empty query", () => {
    const result = cashSessionQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe("paymentSchema", () => {
  it("accepts valid method and amount", () => {
    const result = paymentSchema.safeParse({
      method: "EFECTIVO",
      amount: "50.25",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid method", () => {
    const result = paymentSchema.safeParse({ method: "CHEQUE", amount: 10 });
    expect(result.success).toBe(false);
  });

  it("rejects a negative or zero amount", () => {
    expect(paymentSchema.safeParse({ method: "QR", amount: 0 }).success).toBe(false);
    expect(paymentSchema.safeParse({ method: "QR", amount: -5 }).success).toBe(false);
  });

  it("rejects amount with more than 2 decimals", () => {
    const result = paymentSchema.safeParse({ method: "QR", amount: 10.123 });
    expect(result.success).toBe(false);
  });
});

describe("createSaleSchema payments + cashSessionId", () => {
  const validProducts = [
    { productId: "p-1", quantity: 1, price: 100, category: "x" },
  ];

  it("accepts a single payment", () => {
    const result = createSaleSchema.safeParse({
      products: validProducts,
      payments: [{ method: "EFECTIVO", amount: 100 }],
      cashSessionId: "cs-1",
    });
    expect(result.success).toBe(true);
  });

  it("accepts mixed payments", () => {
    const result = createSaleSchema.safeParse({
      products: validProducts,
      payments: [
        { method: "EFECTIVO", amount: 50 },
        { method: "TARJETA_CREDITO", amount: 50 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts sale without payments (backward-compat)", () => {
    const result = createSaleSchema.safeParse({ products: validProducts });
    expect(result.success).toBe(true);
  });

  it("rejects a payment with invalid method inside payments array", () => {
    const result = createSaleSchema.safeParse({
      products: validProducts,
      payments: [{ method: "CHEQUE", amount: 100 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate methods in payments (R7)", () => {
    const result = createSaleSchema.safeParse({
      products: validProducts,
      payments: [
        { method: "EFECTIVO", amount: 60 },
        { method: "EFECTIVO", amount: 40 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("accepts an optional discountPct between 0 and 100", () => {
    expect(
      createSaleSchema.safeParse({ products: validProducts, discountPct: 10 }).success,
    ).toBe(true);
    expect(
      createSaleSchema.safeParse({ products: validProducts, discountPct: 0 }).success,
    ).toBe(true);
    expect(
      createSaleSchema.safeParse({ products: validProducts, discountPct: 100 }).success,
    ).toBe(true);
  });

  it("rejects discountPct out of range (sdd/venta-descuento)", () => {
    expect(
      createSaleSchema.safeParse({ products: validProducts, discountPct: -1 }).success,
    ).toBe(false);
    expect(
      createSaleSchema.safeParse({ products: validProducts, discountPct: 101 }).success,
    ).toBe(false);
  });

  it("accepts sale without discountPct (backward-compat = 0)", () => {
    const result = createSaleSchema.safeParse({ products: validProducts });
    expect(result.success).toBe(true);
  });

  it("accepts an optional surchargePct between 0 and 100 (recargo-tarjeta-credito)", () => {
    for (const surchargePct of [0, 10, 12.5, 100]) {
      expect(
        createSaleSchema.safeParse({ products: validProducts, surchargePct }).success,
      ).toBe(true);
    }
  });

  it("rejects surchargePct out of range (recargo-tarjeta-credito)", () => {
    expect(
      createSaleSchema.safeParse({ products: validProducts, surchargePct: -1 }).success,
    ).toBe(false);
    expect(
      createSaleSchema.safeParse({ products: validProducts, surchargePct: 101 }).success,
    ).toBe(false);
  });

  it("keeps surchargePct in the parsed output", () => {
    const result = createSaleSchema.safeParse({
      products: validProducts,
      surchargePct: "5",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.surchargePct).toBe(5);
  });
});

describe("createSaleSchema — cuenta corriente (customerId)", () => {
  const validProducts = [{ productId: "p-1", quantity: 1, price: 100, category: "x" }];

  it("paymentSchema accepts CUENTA_CORRIENTE", () => {
    expect(paymentSchema.safeParse({ method: "CUENTA_CORRIENTE", amount: 50 }).success).toBe(true);
  });

  it("accepts customerId together with a CUENTA_CORRIENTE payment", () => {
    const result = createSaleSchema.safeParse({
      products: validProducts,
      payments: [{ method: "CUENTA_CORRIENTE", amount: 100 }],
      customerId: "c-1",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.customerId).toBe("c-1");
  });

  it("customerId is optional and must be a non-empty string", () => {
    expect(createSaleSchema.safeParse({ products: validProducts }).success).toBe(true);
    expect(
      createSaleSchema.safeParse({ products: validProducts, customerId: "" }).success,
    ).toBe(false);
  });
});

describe("createAccountPaymentSchema (cobranza de cuenta corriente)", () => {
  it("accepts a non-cash method with amount", () => {
    const r = createAccountPaymentSchema.safeParse({ amount: 100.5, method: "TRANSFERENCIA", note: "x" });
    expect(r.success).toBe(true);
  });

  it.each(["TARJETA_CREDITO", "TARJETA_DEBITO", "QR"])("accepts %s", (method) => {
    expect(createAccountPaymentSchema.safeParse({ amount: 1, method }).success).toBe(true);
  });

  it("rejects CUENTA_CORRIENTE and unknown methods", () => {
    expect(createAccountPaymentSchema.safeParse({ amount: 1, method: "CUENTA_CORRIENTE" }).success).toBe(false);
    expect(createAccountPaymentSchema.safeParse({ amount: 1, method: "CHEQUE" }).success).toBe(false);
  });

  it("rejects amount <= 0 or with more than 2 decimals", () => {
    expect(createAccountPaymentSchema.safeParse({ amount: 0, method: "QR" }).success).toBe(false);
    expect(createAccountPaymentSchema.safeParse({ amount: -5, method: "QR" }).success).toBe(false);
    expect(createAccountPaymentSchema.safeParse({ amount: 1.234, method: "QR" }).success).toBe(false);
  });

  it("EFECTIVO requires cashSessionId; with it is accepted", () => {
    const missing = createAccountPaymentSchema.safeParse({ amount: 10, method: "EFECTIVO" });
    expect(missing.success).toBe(false);
    if (!missing.success) expect(missing.error.issues[0].path).toEqual(["cashSessionId"]);
    expect(
      createAccountPaymentSchema.safeParse({ amount: 10, method: "EFECTIVO", cashSessionId: "cs-1" }).success,
    ).toBe(true);
  });
});

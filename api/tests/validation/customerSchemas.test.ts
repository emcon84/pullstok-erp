/**
 * Unit tests — createCustomerSchema / updateCustomerSchema
 * (customer-account-historical T1): ningún campo es obligatorio y los strings
 * vacíos se normalizan a null (para no chocar con unique(organizationId, email)).
 */
import {
  createCustomerSchema,
  createProviderSchema,
  updateProviderSchema,
  updateCustomerSchema,
  createAccountChargeSchema,
  createAccountPaymentSchema,
  updateAccountMovementSchema,
} from "../../src/validation/schemas";

describe("createCustomerSchema — todos los campos opcionales", () => {
  it("acepta un body vacío", () => {
    const r = createCustomerSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it("acepta solo teléfono", () => {
    const r = createCustomerSchema.safeParse({ phone: "3400123456" });
    expect(r.success).toBe(true);
    expect(r.data!.phone).toBe("3400123456");
  });

  it("normaliza strings vacíos o de solo espacios a null", () => {
    const r = createCustomerSchema.safeParse({
      name: "",
      email: "   ",
      phone: "",
      taxId: " ",
      taxCondition: "",
      address: "",
    });
    expect(r.success).toBe(true);
    expect(r.data).toEqual({
      name: null,
      email: null,
      phone: null,
      taxId: null,
      taxCondition: null,
      address: null,
    });
  });

  it("recorta espacios en los valores presentes", () => {
    const r = createCustomerSchema.safeParse({ name: "  Ana Perez ", email: " ana@x.com " });
    expect(r.success).toBe(true);
    expect(r.data!.name).toBe("Ana Perez");
    expect(r.data!.email).toBe("ana@x.com");
  });

  it("rechaza un email con formato inválido", () => {
    expect(createCustomerSchema.safeParse({ email: "no-es-un-mail" }).success).toBe(false);
  });
});

describe("updateCustomerSchema", () => {
  it("acepta body vacío y deja las claves ausentes sin tocar", () => {
    const r = updateCustomerSchema.safeParse({});
    expect(r.success).toBe(true);
    expect(r.data).toEqual({});
  });

  it("un email vacío se normaliza a null (limpia el campo)", () => {
    const r = updateCustomerSchema.safeParse({ email: "" });
    expect(r.success).toBe(true);
    expect(r.data!.email).toBeNull();
  });
});

describe("createAccountChargeSchema — cargo histórico (T2)", () => {
  it("solo el monto es obligatorio", () => {
    const r = createAccountChargeSchema.safeParse({ amount: 1500 });
    expect(r.success).toBe(true);
    expect(r.data!.amount).toBe(1500);
    expect(r.data!.date).toBeUndefined();
    expect(r.data!.note).toBeUndefined();
  });

  it("rechaza sin monto, monto 0, negativo o con más de 2 decimales", () => {
    expect(createAccountChargeSchema.safeParse({}).success).toBe(false);
    expect(createAccountChargeSchema.safeParse({ amount: 0 }).success).toBe(false);
    expect(createAccountChargeSchema.safeParse({ amount: -10 }).success).toBe(false);
    expect(createAccountChargeSchema.safeParse({ amount: 1.234 }).success).toBe(false);
  });

  it("acepta fecha ISO (solo día o con hora) y la devuelve como Date", () => {
    const day = createAccountChargeSchema.safeParse({ amount: 10, date: "2026-01-15" });
    expect(day.success).toBe(true);
    expect(day.data!.date).toEqual(new Date("2026-01-15T00:00:00.000Z"));
    const full = createAccountChargeSchema.safeParse({ amount: 10, date: "2026-01-15T10:30:00Z" });
    expect(full.success).toBe(true);
    expect(full.data!.date).toEqual(new Date("2026-01-15T10:30:00.000Z"));
  });

  it("rechaza fecha inválida o futura", () => {
    expect(createAccountChargeSchema.safeParse({ amount: 10, date: "no-fecha" }).success).toBe(false);
    const future = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString();
    expect(createAccountChargeSchema.safeParse({ amount: 10, date: future }).success).toBe(false);
  });

  it("acepta alreadyPaid booleano y lo deja undefined por defecto", () => {
    const paid = createAccountChargeSchema.safeParse({ amount: 10, alreadyPaid: true });
    expect(paid.success).toBe(true);
    expect(paid.data!.alreadyPaid).toBe(true);
    const none = createAccountChargeSchema.safeParse({ amount: 10 });
    expect(none.data!.alreadyPaid).toBeUndefined();
    expect(createAccountChargeSchema.safeParse({ amount: 10, alreadyPaid: "yes" }).success).toBe(false);
  });

  it("recorta la nota y normaliza vacío a null", () => {
    const a = createAccountChargeSchema.safeParse({ amount: 10, note: "  ventas 2025 " });
    expect(a.data!.note).toBe("ventas 2025");
    const b = createAccountChargeSchema.safeParse({ amount: 10, note: "   " });
    expect(b.success).toBe(true);
    expect(b.data!.note).toBeNull();
  });

  it("rechaza notas de más de 500 caracteres", () => {
    expect(createAccountChargeSchema.safeParse({ amount: 10, note: "x".repeat(501) }).success).toBe(false);
  });
});

describe("customer — campos de import GFLOW", () => {
  it("acepta code/locality/province/zone/isActive y normaliza vacíos a null", () => {
    const r = createCustomerSchema.safeParse({
      code: " C-001 ",
      locality: "Rosario",
      province: "Santa Fe",
      zone: "  ",
      isActive: false,
    });
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({
      code: "C-001",
      locality: "Rosario",
      province: "Santa Fe",
      zone: null,
      isActive: false,
    });
  });

  it("rechaza isActive no booleano", () => {
    expect(createCustomerSchema.safeParse({ isActive: "no" }).success).toBe(false);
  });
});

describe("createProviderSchema / updateProviderSchema", () => {
  it("exige nombre", () => {
    expect(createProviderSchema.safeParse({}).success).toBe(false);
    expect(createProviderSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("acepta solo el nombre (back-compat) y recorta espacios", () => {
    const r = createProviderSchema.safeParse({ name: "  Alican  " });
    expect(r.success).toBe(true);
    expect(r.data!.name).toBe("Alican");
  });

  it("acepta todos los campos administrativos", () => {
    const r = createProviderSchema.safeParse({
      name: "Distribuidora SA",
      code: "P-10",
      taxId: "30-12345678-9",
      taxCondition: "RI",
      address: "Calle 1",
      locality: "CABA",
      province: "Buenos Aires",
      phone: "11 1234",
      email: "prov@mail.com",
      classification: "GAST",
      accountingRef: "2001 Proveedores Varios",
      isActive: true,
    });
    expect(r.success).toBe(true);
    expect(r.data!.accountingRef).toBe("2001 Proveedores Varios");
  });

  it("normaliza strings vacíos a null y valida el email", () => {
    const r = createProviderSchema.safeParse({ name: "X", email: "", code: " " });
    expect(r.success).toBe(true);
    expect(r.data!.email).toBeNull();
    expect(r.data!.code).toBeNull();
    expect(createProviderSchema.safeParse({ name: "X", email: "no-mail" }).success).toBe(false);
  });

  it("update es parcial pero no permite nombre vacío", () => {
    expect(updateProviderSchema.safeParse({ isActive: false }).success).toBe(true);
    expect(updateProviderSchema.safeParse({ name: "" }).success).toBe(false);
  });
});

describe("createAccountPaymentSchema — fecha opcional (cuenta-corriente edición)", () => {
  it("sin fecha deja date undefined", () => {
    const r = createAccountPaymentSchema.safeParse({ amount: 10, method: "QR" });
    expect(r.success).toBe(true);
    expect(r.data!.date).toBeUndefined();
  });

  it("parsea fecha ISO (día o fecha-hora) a Date", () => {
    const r = createAccountPaymentSchema.safeParse({ amount: 10, method: "QR", date: "2026-01-15" });
    expect(r.data!.date).toBeInstanceOf(Date);
  });

  it("rechaza fechas inválidas o futuras, tolera 5 minutos", () => {
    expect(createAccountPaymentSchema.safeParse({ amount: 10, method: "QR", date: "no-fecha" }).success).toBe(false);
    const future = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    expect(createAccountPaymentSchema.safeParse({ amount: 10, method: "QR", date: future }).success).toBe(false);
    const nearNow = new Date(Date.now() + 60 * 1000).toISOString();
    expect(createAccountPaymentSchema.safeParse({ amount: 10, method: "QR", date: nearNow }).success).toBe(true);
  });
});

describe("updateAccountMovementSchema — edición de movimiento", () => {
  it("acepta cualquier subconjunto de amount/date/note", () => {
    expect(updateAccountMovementSchema.safeParse({ amount: 50 }).success).toBe(true);
    expect(updateAccountMovementSchema.safeParse({ date: "2026-01-15" }).data!.date).toBeInstanceOf(Date);
    expect(updateAccountMovementSchema.safeParse({ note: "  x " }).data!.note).toBe("x");
  });

  it("nota vacía se normaliza a null (limpia la nota)", () => {
    expect(updateAccountMovementSchema.safeParse({ note: "  " }).data!.note).toBeNull();
  });

  it("rechaza body vacío", () => {
    expect(updateAccountMovementSchema.safeParse({}).success).toBe(false);
  });

  it("rechaza monto <= 0 o con más de 2 decimales", () => {
    expect(updateAccountMovementSchema.safeParse({ amount: 0 }).success).toBe(false);
    expect(updateAccountMovementSchema.safeParse({ amount: -1 }).success).toBe(false);
    expect(updateAccountMovementSchema.safeParse({ amount: 1.234 }).success).toBe(false);
  });

  it("rechaza fecha futura e inválida", () => {
    const future = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    expect(updateAccountMovementSchema.safeParse({ date: future }).success).toBe(false);
    expect(updateAccountMovementSchema.safeParse({ date: "x" }).success).toBe(false);
  });

  it("no admite cambiar el método (campo ignorado, no aparece en la salida)", () => {
    const r = updateAccountMovementSchema.safeParse({ amount: 5, method: "QR" });
    expect(r.success).toBe(true);
    expect((r.data as any).method).toBeUndefined();
  });
});

/**
 * Unit tests — createCustomerSchema / updateCustomerSchema
 * (customer-account-historical T1): ningún campo es obligatorio y los strings
 * vacíos se normalizan a null (para no chocar con unique(organizationId, email)).
 */
import {
  createCustomerSchema,
  updateCustomerSchema,
  createAccountChargeSchema,
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

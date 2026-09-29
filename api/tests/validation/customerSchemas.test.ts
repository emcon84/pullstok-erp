/**
 * Unit tests — createCustomerSchema / updateCustomerSchema
 * (customer-account-historical T1): ningún campo es obligatorio y los strings
 * vacíos se normalizan a null (para no chocar con unique(organizationId, email)).
 */
import { createCustomerSchema, updateCustomerSchema } from "../../src/validation/schemas";

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

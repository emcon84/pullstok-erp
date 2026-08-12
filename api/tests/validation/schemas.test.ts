import {
  applyPriceListSchema,
  adjustPriceListSchema,
} from "../../src/validation/schemas";

describe("applyPriceListSchema — decisiones del preview (position como idTemporal, D6)", () => {
  const validDecision = {
    position: 0,
    accion: "import",
    productId: "00000000-0000-4000-8000-000000000001",
    nombre: "SIEGER Puppy Mini x 1 Kg.",
    precioSinIva: 8795,
    precioConIva: 10642,
  };

  const validBody = {
    layout: "SECO",
    period: "2026-08-10",
    sourceFilename: "082026. LP Alican SECO - 10ago2026.pdf",
    rows: [validDecision],
  };

  it("accepts a valid payload with a full decision", () => {
    const result = applyPriceListSchema.safeParse(validBody);
    expect(result.success).toBe(true);
  });

  it("rejects an invalid position (negative / non-integer)", () => {
    expect(
      applyPriceListSchema.safeParse({
        ...validBody,
        rows: [{ ...validDecision, position: -1 }],
      }).success,
    ).toBe(false);
    expect(
      applyPriceListSchema.safeParse({
        ...validBody,
        rows: [{ ...validDecision, position: 1.5 }],
      }).success,
    ).toBe(false);
  });

  it("rejects an invalid accion", () => {
    const result = applyPriceListSchema.safeParse({
      ...validBody,
      rows: [{ ...validDecision, accion: "delete" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-uuid productId", () => {
    const result = applyPriceListSchema.safeParse({
      ...validBody,
      rows: [{ ...validDecision, productId: "no-es-uuid" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty rows array", () => {
    const result = applyPriceListSchema.safeParse({ ...validBody, rows: [] });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed period (not ISO)", () => {
    const result = applyPriceListSchema.safeParse({
      ...validBody,
      period: "10/08/2026",
    });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate positions (anti-tamper)", () => {
    const result = applyPriceListSchema.safeParse({
      ...validBody,
      rows: [validDecision, validDecision],
    });
    expect(result.success).toBe(false);
  });

  it("accepts omit decisions without productId", () => {
    const result = applyPriceListSchema.safeParse({
      ...validBody,
      rows: [
        { position: 0, accion: "omit", nombre: "STARTER Kit", precioSinIva: null, precioConIva: null },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe("adjustPriceListSchema — ajuste masivo de sugeridos", () => {
  it("accepts a percentage-only payload", () => {
    expect(adjustPriceListSchema.safeParse({ percentage: 10 }).success).toBe(true);
  });

  it("rejects a percentage outside −100..500", () => {
    expect(adjustPriceListSchema.safeParse({ percentage: 501 }).success).toBe(false);
    expect(adjustPriceListSchema.safeParse({ percentage: -101 }).success).toBe(false);
  });

  it("rejects duplicate entryOverrides (anti-duplicados)", () => {
    const override = {
      entryId: "00000000-0000-4000-8000-000000000002",
      suggestedPrice: 15000,
    };
    const result = adjustPriceListSchema.safeParse({
      percentage: 10,
      entryOverrides: [override, override],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-uuid excludeEntryId", () => {
    const result = adjustPriceListSchema.safeParse({ excludeEntryIds: ["zzz"] });
    expect(result.success).toBe(false);
  });

  it("defaults arrays when omitted", () => {
    const result = adjustPriceListSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.excludeEntryIds).toEqual([]);
      expect(result.data.entryOverrides).toEqual([]);
    }
  });
});

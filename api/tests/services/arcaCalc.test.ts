import {
  calcArcaAmounts,
  normalizeCuit,
  isValidCuit,
  deriveReceptorFiscal,
  mapAlicuotaId,
  mapCondicionIvaId,
} from "../../src/services/arcaCalc";

// Helper PURO de cálculo fiscal ARCA (sdd/arca-facturacion-electronica, spec 5):
// centavos enteros (sin Float en el payload), redondeo ARCA (half-up a 2
// decimales por línea, consistente con invoiceCalc), cuadratura neto + exento
// + IVA = total, y validación/normalización de CUIT (DV mod 11).

describe("calcArcaAmounts", () => {
  it("calcula neto/IVA/total en centavos exactos para una línea 21% (cuadratura)", () => {
    const result = calcArcaAmounts([
      { quantity: 2, unitPrice: 100, taxRate: 21 },
    ]);

    // neto línea = round2(2×100)=200 → 20000 centavos; IVA = 21% → 4200
    expect(result.netoCents).toBe(20000);
    expect(result.ivaCents).toBe(4200);
    expect(result.exentoCents).toBe(0);
    expect(result.totalCents).toBe(24200);
    expect(result.netoCents + result.ivaCents).toBe(result.totalCents);
  });

  it("línea exenta 0% → IVA 0 y el monto va a exento (ImpOpEx), total = exento", () => {
    const result = calcArcaAmounts([
      { quantity: 3, unitPrice: 50, taxRate: 0 },
    ]);

    expect(result.netoCents).toBe(0);
    expect(result.ivaCents).toBe(0);
    expect(result.exentoCents).toBe(15000);
    expect(result.totalCents).toBe(15000);
    expect(result.porAlicuota).toHaveLength(0);
  });

  it("mixto (21% + exento): cuadra por tasa y neto + exento + IVA = total", () => {
    const result = calcArcaAmounts([
      { quantity: 2, unitPrice: 100, taxRate: 21 },
      { quantity: 1, unitPrice: 40, taxRate: 0 },
    ]);

    expect(result.netoCents).toBe(20000);
    expect(result.ivaCents).toBe(4200);
    expect(result.exentoCents).toBe(4000);
    expect(result.totalCents).toBe(28200);
    expect(result.netoCents + result.exentoCents + result.ivaCents).toBe(
      result.totalCents,
    );
    // Desglose por alícuota: solo la tasa 21 (gravada) entra en el Iva.
    expect(result.porAlicuota).toEqual([
      { tasa: 21, baseImpCents: 20000, importeCents: 4200 },
    ]);
  });

  it("redondea cada línea a 2 decimales ANTES de pasar a centavos (consistente con invoiceCalc)", () => {
    // 1.005 no existe en binario exacto: round2(1×1.005)=1.01 (guard EPSILON
    // de money.ts) → 101 centavos; IVA = round(101×0.21)=21; total = 122.
    const result = calcArcaAmounts([
      { quantity: 1, unitPrice: 1.005, taxRate: 21 },
    ]);

    expect(result.netoCents).toBe(101);
    expect(result.ivaCents).toBe(21);
    expect(result.totalCents).toBe(122);
  });

  it("acumula varias líneas de la misma alícuota en un solo AlicIva", () => {
    const result = calcArcaAmounts([
      { quantity: 1, unitPrice: 100, taxRate: 21 },
      { quantity: 1, unitPrice: 200, taxRate: 21 },
    ]);

    expect(result.netoCents).toBe(30000);
    expect(result.ivaCents).toBe(6300);
    expect(result.totalCents).toBe(36300);
    expect(result.porAlicuota).toEqual([
      { tasa: 21, baseImpCents: 30000, importeCents: 6300 },
    ]);
  });

  it("serializa a string ARCA con 2 decimales (centavos / 100).toFixed(2)", () => {
    const result = calcArcaAmounts([
      { quantity: 2, unitPrice: 100, taxRate: 21 },
    ]);

    expect((result.netoCents / 100).toFixed(2)).toBe("200.00");
    expect((result.ivaCents / 100).toFixed(2)).toBe("42.00");
    expect((result.totalCents / 100).toFixed(2)).toBe("242.00");
  });

  it("lista vacía → ceros sin romper", () => {
    const result = calcArcaAmounts([]);

    expect(result.netoCents).toBe(0);
    expect(result.ivaCents).toBe(0);
    expect(result.exentoCents).toBe(0);
    expect(result.totalCents).toBe(0);
    expect(result.porAlicuota).toHaveLength(0);
  });
});

describe("normalizeCuit", () => {
  it('normaliza "30-70970670-1" → "30709706701" (guiones)', () => {
    expect(normalizeCuit("30-70970670-1")).toBe("30709706701");
  });

  it("normaliza con espacios y puntos", () => {
    expect(normalizeCuit(" 30.70970670-1 ")).toBe("30709706701");
  });

  it("deja intacto un CUIT ya normalizado", () => {
    expect(normalizeCuit("30709706701")).toBe("30709706701");
  });
});

describe("isValidCuit", () => {
  it("acepta el CUIT de Don Colacho (DV mod 11 correcto)", () => {
    expect(isValidCuit("30709706701")).toBe(true);
    expect(isValidCuit("30-70970670-1")).toBe(true);
  });

  it("rechaza CUIT con DV incorrecto", () => {
    expect(isValidCuit("30709706702")).toBe(false);
  });

  it("rechaza CUIT con formato malformado (largo != 11 o no numérico)", () => {
    expect(isValidCuit("3070970670")).toBe(false); // 10 dígitos
    expect(isValidCuit("307097067011")).toBe(false); // 12 dígitos
    expect(isValidCuit("abc")).toBe(false);
    expect(isValidCuit("")).toBe(false);
  });

  it("rechaza CUIT cuyo DV mod 11 da 10 (CUIT inexistente)", () => {
    // "20-00000001-?" → sum = 2*5 + 1*2 = 12 → 12 mod 11 = 1 → DV = 10.
    // El dígito verificador 10 no existe: el CUIT "20000000010" es inválido.
    expect(isValidCuit("20000000010")).toBe(false);
  });
});

describe("mapAlicuotaId", () => {
  it("mapea las alícuotas ARCA conocidas", () => {
    expect(mapAlicuotaId(21)).toBe(5);
    expect(mapAlicuotaId(10.5)).toBe(4);
    expect(mapAlicuotaId(27)).toBe(6);
    expect(mapAlicuotaId(5)).toBe(7);
    expect(mapAlicuotaId(2.5)).toBe(8);
    expect(mapAlicuotaId(0)).toBe(3);
  });

  it("lanza para alícuotas no soportadas por ARCA", () => {
    expect(() => mapAlicuotaId(15)).toThrow(/soportada/i);
  });
});

describe("deriveReceptorFiscal", () => {
  it("sin taxId → Factura B consumidor final (DocTipo 99 / DocNro 0 / condIva 5)", () => {
    expect(deriveReceptorFiscal(null)).toEqual({
      ok: true,
      receptor: { docTipo: 99, docNro: "0", condicionIvaReceptorId: 5 },
    });
    expect(deriveReceptorFiscal("")).toEqual({
      ok: true,
      receptor: { docTipo: 99, docNro: "0", condicionIvaReceptorId: 5 },
    });
  });

  it("CUIT válido → Factura A (DocTipo 80 / CUIT normalizado / condIva 1)", () => {
    expect(deriveReceptorFiscal("30-70970670-1")).toEqual({
      ok: true,
      receptor: {
        docTipo: 80,
        docNro: "30709706701",
        condicionIvaReceptorId: 1,
      },
    });
  });

  it("DNI (7-8 dígitos) → Factura B identificada (DocTipo 96 / condIva 5)", () => {
    expect(deriveReceptorFiscal("33444555")).toEqual({
      ok: true,
      receptor: { docTipo: 96, docNro: "33444555", condicionIvaReceptorId: 5 },
    });
  });

  it("CUIT con DV incorrecto → CUIT_INVALIDO sin avanzar (spec 5.4)", () => {
    expect(deriveReceptorFiscal("30709706702")).toEqual({
      ok: false,
      error: "CUIT_INVALIDO",
    });
  });

  it("taxId irreconocible (ni CUIT ni DNI) → CUIT_INVALIDO (no emitir B/99 por error de tipeo)", () => {
    expect(deriveReceptorFiscal("ABC123")).toEqual({
      ok: false,
      error: "CUIT_INVALIDO",
    });
    expect(deriveReceptorFiscal("123456")).toEqual({
      ok: false,
      error: "CUIT_INVALIDO",
    });
  });
});

describe("mapCondicionIvaId (deuda técnica item 3)", () => {
  it("mapea Responsable Inscripto → 1 (tolerante a acentos/mayúsculas)", () => {
    expect(mapCondicionIvaId("IVA Responsable Inscripto")).toBe(1);
    expect(mapCondicionIvaId("responsable inscripto")).toBe(1);
    expect(mapCondicionIvaId("RESPONSABLE INSCRIPTO")).toBe(1);
  });

  it("mapea Monotributo → 6", () => {
    expect(mapCondicionIvaId("Monotributista")).toBe(6);
    expect(mapCondicionIvaId("Monotributo")).toBe(6);
  });

  it("mapea Exento / No alcanzado → 4", () => {
    expect(mapCondicionIvaId("Exento")).toBe(4);
    expect(mapCondicionIvaId("IVA No alcanzado")).toBe(4);
  });

  it("mapea Consumidor Final → 5", () => {
    expect(mapCondicionIvaId("Consumidor Final")).toBe(5);
  });

  it("sin dato o irreconocible → default 5 (Consumidor Final, seguro)", () => {
    expect(mapCondicionIvaId(null)).toBe(5);
    expect(mapCondicionIvaId(undefined)).toBe(5);
    expect(mapCondicionIvaId("")).toBe(5);
    expect(mapCondicionIvaId("texto random")).toBe(5);
  });
});

describe("deriveReceptorFiscal con condición IVA (deuda técnica item 3)", () => {
  it("DNI + Responsable Inscripto → condIva 1 (no más clavado en 5)", () => {
    expect(deriveReceptorFiscal("33444555", "IVA Responsable Inscripto")).toEqual({
      ok: true,
      receptor: { docTipo: 96, docNro: "33444555", condicionIvaReceptorId: 1 },
    });
  });

  it("DNI + Monotributo → condIva 6", () => {
    expect(deriveReceptorFiscal("33444555", "Monotributista")).toEqual({
      ok: true,
      receptor: { docTipo: 96, docNro: "33444555", condicionIvaReceptorId: 6 },
    });
  });

  it("DNI + sin condición → condIva 5 (default seguro, compat)", () => {
    expect(deriveReceptorFiscal("33444555")).toEqual({
      ok: true,
      receptor: { docTipo: 96, docNro: "33444555", condicionIvaReceptorId: 5 },
    });
  });
});

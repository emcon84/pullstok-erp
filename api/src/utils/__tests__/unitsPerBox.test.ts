/**
 * Unit tests de unitsPerBox (sdd/venta-por-unidad-multpack). Sin DB: funciones
 * puras. RED→GREEN (task 1.4/2.5).
 */
import {
  parseUnitsPerBoxFromName,
  computePerUnitPrice,
  isUnitSellable,
} from "../unitsPerBox";

describe("parseUnitsPerBoxFromName", () => {
  it("multi-pack 'NxG' lowercase x: 'FELIX POUCH PESC BLANCO EN SALSA X 15x85grs' → 15", () => {
    expect(
      parseUnitsPerBoxFromName("FELIX POUCH PESC BLANCO EN SALSA X 15x85grs"),
    ).toBe(15);
  });

  it("uppercase X y espacios: 'PRODUCTO 15 X 85grs' → 15", () => {
    expect(parseUnitsPerBoxFromName("PRODUCTO 15 X 85grs")).toBe(15);
  });

  it("espacio antes de la unidad: 'PRODUCTO 12x3 kg' → 12", () => {
    expect(parseUnitsPerBoxFromName("PRODUCTO 12x3 kg")).toBe(12);
  });

  it("NO matchea peso suelto 'X 15 KG' (sin dígitos antes de la X)", () => {
    expect(parseUnitsPerBoxFromName("X 15 KG")).toBeNull();
  });

  it("NO matchea 'FELIX 21.5 KG' (sin patrón NxG / unidad en mayúscula)", () => {
    expect(parseUnitsPerBoxFromName("FELIX 21.5 KG")).toBeNull();
  });

  it("NO matchea 'ROYAL CANIN X 15 KG' (X precedida de letra, no dígito)", () => {
    expect(parseUnitsPerBoxFromName("ROYAL CANIN X 15 KG")).toBeNull();
  });

  it("NO matchea una cadena sin patrón NxG", () => {
    expect(parseUnitsPerBoxFromName("PURINA GATO ADULTO")).toBeNull();
  });

  it("NO matchea cuando la unidad no es de peso/unidad", () => {
    expect(parseUnitsPerBoxFromName("PRODUCTO 12x85 ML")).toBeNull();
  });

  it("multi-pack entre parentesis con peso mayúscula: '(12X85G) X 1.02 KG' → 12", () => {
    expect(
      parseUnitsPerBoxFromName("ROYAL CANIN FCN URINARY CARE POUCH (12X85G) X 1.02 KG"),
    ).toBe(12);
  });

  it("'X N U' después de la X (COMPLETE/NATURAL): '85G (X12U)' → 12", () => {
    expect(
      parseUnitsPerBoxFromName("COMPLETE POUCH GATO AD. CARNE 85G (X12U)"),
    ).toBe(12);
  });

  it("'X15 UNI' (CAT CHOW): 'POLLO X15 UNI' → 15", () => {
    expect(
      parseUnitsPerBoxFromName("CAT CHOW POUCH POLLO X15 UNI"),
    ).toBe(15);
  });

  it("'N X M KG' con coma decimal y espacios: '12 X 1,5 KG' → 12", () => {
    expect(parseUnitsPerBoxFromName("UPPER CROCK GATOS ADULTOS 30% 12 X 1,5 KG")).toBe(12);
  });

  it("'N X M KG' compacto: '6X3 KG' → 6", () => {
    expect(parseUnitsPerBoxFromName("UPPER CROCK PERROS ADULTOS 6X3 KG")).toBe(6);
  });

  it("'N x M gr' (Katze/Sieger Wet): 'Senior +12 x 340 gr.' → 12", () => {
    expect(parseUnitsPerBoxFromName("Sieger Wet Senior +12 x 340 gr.")).toBe(12);
  });

  it("NO matchea volumen ml: 'RUMINAL 88 X 100 ML' → null", () => {
    expect(parseUnitsPerBoxFromName("RUMINAL 88 X 100 ML")).toBeNull();
  });

  it("NO matchea comprimidos/COMP: 'SPECTRYL 10 X 100 COMP' → null", () => {
    expect(parseUnitsPerBoxFromName("SPECTRYL 10 X 100 COMP")).toBeNull();
  });

  it("NO matchea 'X 1.02 KG' (peso total del carton, sin dígito antes de la X)", () => {
    expect(parseUnitsPerBoxFromName("ROYAL CANIN X 1.02 KG")).toBeNull();
  });

  it("NO matchea edad+peso: 'PRO PLAN CAT ADULT +7 X7,5KG' → null (7 es edad)", () => {
    expect(parseUnitsPerBoxFromName("PRO PLAN CAT ADULT +7 X7,5KG")).toBeNull();
  });

  it("NO matchea edad+peso: 'ROYAL CANIN AGEING +11 X 2 KG' → null (11 es edad)", () => {
    expect(parseUnitsPerBoxFromName("ROYAL CANIN AGEING +11 X 2 KG")).toBeNull();
  });

  it("NO matchea edad+peso: 'PEDIGREE SENIOR +7 X 8KG' → null (7 es edad)", () => {
    expect(parseUnitsPerBoxFromName("PEDIGREE SENIOR +7 X 8KG")).toBeNull();
  });

  it("sigue matcheando multi-pack real 'UPPER CROCK 12 X 0,5 KG' → 12", () => {
    expect(parseUnitsPerBoxFromName("UPPER CROCK GATOS ADULTOS 30% 12 X 0,5 KG")).toBe(12);
  });
});

describe("computePerUnitPrice", () => {
  it("redondea hacia arriba al próximo $100: 18400 ÷ 15 = 1226.67 → 1300", () => {
    expect(computePerUnitPrice(18400, 15)).toBe(1300);
  });

  it("redondea hacia arriba: 18400.5 ÷ 15 = 1226.7 → 1300", () => {
    expect(computePerUnitPrice(18400.5, 15)).toBe(1300);
  });

  it("redondea hacia arriba: 100 ÷ 3 = 33.33 → 100", () => {
    expect(computePerUnitPrice(100, 3)).toBe(100);
  });

  it("no redondea cuando el resultado ya es múltiplo de 100: 7000 ÷ 7 = 1000 → 1000", () => {
    expect(computePerUnitPrice(7000, 7)).toBe(1000);
  });

  it("redondea hacia arriba: 7000 ÷ 12 = 583.33 → 600", () => {
    expect(computePerUnitPrice(7000, 12)).toBe(600);
  });

  it("unitsPerBox null/undefined/0 → null (no se puede derivar)", () => {
    expect(computePerUnitPrice(18400, null)).toBeNull();
    expect(computePerUnitPrice(18400, undefined)).toBeNull();
    expect(computePerUnitPrice(18400, 0)).toBeNull();
  });
});

describe("isUnitSellable", () => {
  it("null o 1 → no vendible por unidad", () => {
    expect(isUnitSellable(null)).toBe(false);
    expect(isUnitSellable(1)).toBe(false);
    expect(isUnitSellable(0)).toBe(false);
    expect(isUnitSellable(undefined)).toBe(false);
  });

  it("> 1 → vendible por unidad", () => {
    expect(isUnitSellable(2)).toBe(true);
    expect(isUnitSellable(15)).toBe(true);
  });
});

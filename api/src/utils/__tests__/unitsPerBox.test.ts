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
});

describe("computePerUnitPrice", () => {
  it("round2(18400 ÷ 15) = 1226.67", () => {
    expect(computePerUnitPrice(18400, 15)).toBe(1226.67);
  });

  it("round2(18400.5 ÷ 15) = 1226.7", () => {
    expect(computePerUnitPrice(18400.5, 15)).toBe(1226.7);
  });

  it("round2(100 ÷ 3) = 33.33", () => {
    expect(computePerUnitPrice(100, 3)).toBe(33.33);
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

import { computeWholesalePrice } from "../../src/services/providerPriceListService";

/**
 * Wholesale price computation (feature "precio mayorista para usuario
 * interno"): wholesalePrice = roundBolsaPriceIfHigh(round2(sinIva × 1.21 ×
 * 1.15)). Mismo cálculo que ya imprime PriceListDetail.tsx (precioMayorista);
 * el número persistido en Product.wholesalePrice tiene que coincidir con lo
 * que se imprime.
 */
describe("computeWholesalePrice — round2(sinIva × 1.21 × 1.15), redondeado si >= 500", () => {
  it("computes IVA + ganancia sobre Sin IVA", () => {
    // 8795 × 1.21 × 1.15 = 12238.2425 → round2 12238.24 → >= 500 → redondea a 12200
    expect(computeWholesalePrice(8795)).toBe(12200);
  });

  it("no redondea al múltiplo de 100 por debajo de 500", () => {
    // 100 × 1.21 × 1.15 = 139.15
    expect(computeWholesalePrice(100)).toBe(139.15);
  });

  it("returns null when sinIva is missing", () => {
    expect(computeWholesalePrice(null)).toBeNull();
    expect(computeWholesalePrice(undefined)).toBeNull();
  });
});

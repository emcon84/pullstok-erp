/**
 * Unit tests de la lógica pura de backfill/rollback de unitsPerBox
 * (sdd/venta-por-unidad-multpack, tasks 3.1-3.3). Sin DB: la parte de stock en
 * UNIDADES se testea acá; el apply/rollback en DB es e2e-only en el VPS.
 */
import {
  deriveBackfillUnitsPerBox,
  unitsForBoxes,
  boxesForUnits,
  shouldBackfill,
} from "../../prisma/scripts/unitsPerBoxMigration";

describe("deriveBackfillUnitsPerBox", () => {
  it("deriva 15 de un nombre NxG cuando unitsPerBox es null", () => {
    expect(deriveBackfillUnitsPerBox("FELIX POUCH PESC BLANCO EN SALSA X 15x85grs", null)).toBe(15);
  });

  it("NO deriva de un nombre sin patrón NxG (peso suelto)", () => {
    expect(deriveBackfillUnitsPerBox("ROYAL CANIN X 15 KG", null)).toBeNull();
    expect(deriveBackfillUnitsPerBox("PURINA GATO ADULTO", null)).toBeNull();
  });

  it("rechaza un parse <= 1 (no es un multi-pack real)", () => {
    expect(deriveBackfillUnitsPerBox("PRODUCTO 1x500grs", null)).toBeNull();
  });

  it("skip idempotente: si unitsPerBox ya está seteado, NO re-deriva", () => {
    expect(deriveBackfillUnitsPerBox("FELIX X 15x85grs", 10)).toBeNull();
  });
});

describe("shouldBackfill", () => {
  it("true solo cuando unitsPerBox es null", () => {
    expect(shouldBackfill(null)).toBe(true);
    expect(shouldBackfill(undefined)).toBe(true);
    expect(shouldBackfill(15)).toBe(false);
    expect(shouldBackfill(1)).toBe(false);
  });
});

describe("unitsForBoxes", () => {
  it("10 cajas × 15 unidades = 150 unidades", () => {
    expect(unitsForBoxes(10, 15)).toBe(150);
  });

  it("1 caja × 15 = 15", () => {
    expect(unitsForBoxes(1, 15)).toBe(15);
  });
});

describe("boxesForUnits", () => {
  it("150 unidades ÷ 15 = 10 cajas", () => {
    expect(boxesForUnits(150, 15)).toBe(10);
  });

  it("150 unidades ÷ 12 = 12.5 cajas (stock suelto fraccionario)", () => {
    expect(boxesForUnits(150, 12)).toBe(12.5);
  });
});

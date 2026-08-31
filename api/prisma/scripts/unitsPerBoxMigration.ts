/**
 * Lógica PURA del backfill/rollback de unitsPerBox (sdd/venta-por-unidad-multpack,
 * tasks 3.1-3.3). Sin DB: solo funciones de derivación/conversión testeadas en
 * tests/scripts/unitsPerBoxMigration.test.ts. Los scripts operativos
 * (backfill-unitsPerBox.ts / rollback-unitsPerBox.ts) importan estas funciones y
 * hacen el I/O contra el VPS (e2e-only).
 */
import { parseUnitsPerBoxFromName } from "../../src/utils/unitsPerBox";

/**
 * Decide si un producto debe pasar por el backfill y con qué `unitsPerBox`.
 * Regla de idempotencia: si `unitsPerBox` ya está seteado → null (skip, no
 * re-deriva). Si no está seteado → intenta parsear del nombre; solo acepta un
 * multi-pack real (>= 2, es decir `> 1`). Devuelve el valor a setear o null.
 */
export function deriveBackfillUnitsPerBox(
  name: string,
  currentUnitsPerBox: number | null | undefined,
): number | null {
  if (currentUnitsPerBox !== null && currentUnitsPerBox !== undefined) {
    return null; // ya seteado → skip idempotente
  }
  const parsed = parseUnitsPerBoxFromName(name);
  if (parsed === null || parsed <= 1) return null; // no multi-pack real
  return parsed;
}

/** Verdadero cuando el producto todavía NO tiene unitsPerBox (hay que backfillear). */
export function shouldBackfill(unitsPerBox: number | null | undefined): boolean {
  return unitsPerBox === null || unitsPerBox === undefined;
}

/**
 * Convierte stock en CAJAS a stock en UNIDADES (backfill forward):
 * boxQty × unitsPerBox.
 */
export function unitsForBoxes(boxQuantity: number, unitsPerBox: number): number {
  return boxQuantity * unitsPerBox;
}

/**
 * Convierte stock en UNIDADES a stock en CAJAS (rollback reverse):
 * unitQuantity ÷ unitsPerBox. Float (ProductStock.quantity es Float).
 */
export function boxesForUnits(unitQuantity: number, unitsPerBox: number): number {
  return unitQuantity / unitsPerBox;
}

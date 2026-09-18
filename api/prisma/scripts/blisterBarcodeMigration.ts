/**
 * Lógica PURA de la asignación de barcodes inventados a productos BLISTER
 * (creados sin barcode por api/scripts/create-blister-products.ts). Sin DB:
 * solo la decisión, testeada en tests/scripts/blisterBarcodeMigration.test.ts.
 * El script operativo (api/scripts/assign-blister-barcodes.ts) importa esta
 * función y hace el I/O contra el VPS.
 */

/**
 * Decide si un producto BLISTER debe recibir un barcode inventado.
 * Idempotente: si ya tiene barcode, se saltea (no lo pisa).
 */
export function shouldAssignBlisterBarcode(
  name: string,
  currentBarcode: string | null | undefined,
): boolean {
  if (currentBarcode) return false;
  return /BLISTER/i.test(name);
}

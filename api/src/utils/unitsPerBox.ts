/**
 * Utilidades puras de multi-pack por unidad (sdd/venta-por-unidad-multpack).
 * Sin DB, sin side-effects: son la fuente de verdad de la derivación de
 * `unitsPerBox` y `perUnitPrice`.
 */
import { round2 } from "./money";

// Patrón "NxG" de un multi-pack (ej. "15x85grs" → 15): 1-4 dígitos, una 'x'/'X',
// la cantidad de gramos/peso, y una unidad de peso/unidad. NO matchea pesos
// sueltos como "X 15 KG" (sin dígitos justo antes de la X) ni "21.5 KG" (unidad
// en mayúscula, sin patrón NxG). Case-sensitive a propósito para no matchear
// "KG" mayúscula de pesos sueltos; ver Open Questions del design (verificar
// contra el catálogo live en VPS antes del backfill).
const UNITS_PER_BOX_REGEX =
  /(\d{1,4})\s*[xX]\s*\d+(?:[.,]\d+)?\s*(?:grs|gr|g|kg|un|u|und)\b/;

/**
 * Deriva `unitsPerBox` del nombre del producto (patrón "NxG"). Devuelve el
 * número capturado (ej. "15x85grs" → 15) o `null` si el nombre no matchea.
 */
export function parseUnitsPerBoxFromName(name: string): number | null {
  const match = UNITS_PER_BOX_REGEX.exec(name);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Precio por unidad derivado del precio de caja (box anchor): round2(price ÷
 * unitsPerBox). `null` cuando no se puede derivar (unitsPerBox ausente o <= 0).
 * NUNCA se persiste — se deriva on-the-fly (single source of truth).
 */
export function computePerUnitPrice(
  price: number,
  unitsPerBox: number | null | undefined,
): number | null {
  if (unitsPerBox === null || unitsPerBox === undefined || unitsPerBox <= 0) {
    return null;
  }
  return round2(price / unitsPerBox);
}

/**
 * Un producto es vendible "por unidad" SOLO cuando `unitsPerBox > 1` y no null.
 * `unitsPerBox` = 1 o null → box-only (fallback al comportamiento legacy).
 */
export function isUnitSellable(
  unitsPerBox: number | null | undefined,
): boolean {
  return unitsPerBox !== null && unitsPerBox !== undefined && unitsPerBox > 1;
}

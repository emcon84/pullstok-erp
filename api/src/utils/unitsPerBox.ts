/**
 * Utilidades puras de multi-pack por unidad (sdd/venta-por-unidad-multpack).
 * Sin DB, sin side-effects: son la fuente de verdad de la derivación de
 * `unitsPerBox` y `perUnitPrice`.
 */
import { round2 } from "./money";

// Unidades de PESO que indican un multi-pack (una caja con N sobres/latas/bolsas).
// NO incluye volumen (ml/lts) ni comprimidos: evita falsos positivos como
// "RUMINAL 88 X 100 ML" o "SPECTRYL 10 X 100 COMP".
const WEIGHT_UNITS = "(?:grs?|gr|g|kg)";

// Patrón A — el conteo va ANTES de la 'x', con unidad de peso:
//   "15x85grs", "12X85G", "(6X195G)", "12 X 0,5 KG", "7 x 340 gr".
// Dentro de "(12X85G) X 1.02 KG" el "X 1.02 KG" del final NO matchea (no hay
// dígito justo antes de esa X), así que se toma el conteo del parentesis.
const COUNT_BEFORE_X_REGEX = new RegExp(
  `(\\d{1,3})\\s*[xX]\\s*\\d+(?:[.,]\\d+)?\\s*${WEIGHT_UNITS}\\b`,
  "i",
);

// Patrón B — el conteo va DESPUÉS de la 'x' con palabra de unidad:
//   "X12U", "X15 UNI", "X 12 U". No matchea "X 15 KG" (KG no es palabra de
//   unidad) ni "X 1.02 KG" (el peso total del carton).
const COUNT_AFTER_X_REGEX =
  /[xX]\s*(\d{1,3})\s*(?:unid|unit|uni|und|un|u)\b/i;

// Límite superior defensivo: los multi-pack de alimento son tipicamente 3-24
// (pouches/latas). Evita cazar "300 x 16" (medicación) si se colara un peso.
const MAX_UNITS_PER_BOX = 48;

function isPlausibleCount(n: number): boolean {
  return n >= 2 && n <= MAX_UNITS_PER_BOX;
}

/**
 * Deriva `unitsPerBox` del nombre del producto (patrones multi-pack de peso:
 * "NxM<unidad>" y "X N U/UNI"). Devuelve el número capturado o `null`.
 */
export function parseUnitsPerBoxFromName(name: string): number | null {
  const before = COUNT_BEFORE_X_REGEX.exec(name);
  if (before) {
    const n = Number(before[1]);
    if (isPlausibleCount(n)) return n;
  }
  const after = COUNT_AFTER_X_REGEX.exec(name);
  if (after) {
    const n = Number(after[1]);
    if (isPlausibleCount(n)) return n;
  }
  return null;
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

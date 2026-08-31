/**
 * Utilidades puras de multi-pack por unidad (sdd/venta-por-unidad-multpack).
 * Sin DB, sin side-effects: son la fuente de verdad de la derivación de
 * `unitsPerBox` y `perUnitPrice`.
 */
// Unidades de PESO que indican un multi-pack (una caja con N sobres/latas/bolsas).
// NO incluye volumen (ml/lts) ni comprimidos: evita falsos positivos como
// "RUMINAL 88 X 100 ML" o "SPECTRYL 10 X 100 COMP".

// Patrón A — el conteo va ANTES de la 'x', con unidad de peso. Captura la
// unidad (grupo 2) para desambiguar edad vs conteo en el código.
//   "15x85grs", "12X85G", "(6X195G)", "12 X 0,5 KG", "7 x 340 gr".
// (?<![\d]) evita agarrar un dígito que es parte de un número mayor.
const COUNT_BEFORE_X_REGEX = new RegExp(
  `(?<![\\d])(\\d{1,3})\\s*[xX]\\s*\\d+(?:[.,]\\d+)?\\s*(grs?|gr|g|kg)\\b`,
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
    const unit = before[2]?.toLowerCase();
    // "ADULT +7 X7,5KG" / "AGEING +11 X 2 KG": el "+N" es EDAD y el peso es KG
    // (bolsa seca de 7,5/2kg), NO un conteo. En gramos (latas/pouches húmedos)
    // "+12 x 340 gr" sí es un conteo real, se acepta.
    const isAgeKg = unit === "kg" && name[before.index - 1] === "+";
    if (isPlausibleCount(n) && !isAgeKg) return n;
  }
  const after = COUNT_AFTER_X_REGEX.exec(name);
  if (after) {
    const n = Number(after[1]);
    if (isPlausibleCount(n)) return n;
  }
  return null;
}

// Paso de redondeo del precio por unidad (hacia ARRIBA): se vende el pouch al
// próximo "número redondo" ($100). Ej. 18.400 ÷ 15 = 1.226,67 → 1.300.
const UNIT_PRICE_ROUND_STEP = 100;

/**
 * Precio por unidad derivado del precio de caja: round2(price ÷ unitsPerBox)
 * redondeado HACIA ARRIBA al próximo `UNIT_PRICE_ROUND_STEP` (ej. 18.400 ÷ 15
 * = 1.226,67 → 1.300). `null` cuando no se puede derivar (unitsPerBox ausente
 * o <= 0). NUNCA se persiste — se deriva on-the-fly (single source of truth).
 */
export function computePerUnitPrice(
  price: number,
  unitsPerBox: number | null | undefined,
): number | null {
  if (unitsPerBox === null || unitsPerBox === undefined || unitsPerBox <= 0) {
    return null;
  }
  const perUnit = price / unitsPerBox;
  return Math.ceil(perUnit / UNIT_PRICE_ROUND_STEP) * UNIT_PRICE_ROUND_STEP;
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

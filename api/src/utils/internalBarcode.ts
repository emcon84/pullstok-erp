/**
 * Formato de código interno inventado para productos sin barcode real, con un
 * `prefix` explícito (ej. "BLST" para BLISTER, "INT" para el generador general
 * de catálogo — ver api/src/controllers/productController.ts,
 * generateProductBarcode). "<prefix>" + 5 dígitos secuenciales, ej. BLST00001.
 * Alfanumérico a propósito: NO usar un numérico de 13 dígitos que empiece con
 * "20" — colisiona con el prefijo de balanza (ver api/src/utils/scaleBarcode.ts,
 * SCALE_PREFIX).
 */

const SEQ_LENGTH = 5;

export const formatInternalBarcode = (prefix: string, n: number): string =>
  `${prefix}${String(n).padStart(SEQ_LENGTH, "0")}`;

export const parseInternalBarcodeSeq = (
  prefix: string,
  barcode: string,
): number | null => {
  const re = new RegExp(`^${prefix}(\\d{${SEQ_LENGTH}})$`);
  const match = re.exec(barcode.trim());
  if (!match) return null;
  return Number(match[1]);
};

/** Máximo número de secuencia ya usado para ESE prefix + 1, o 1 si no hay ninguno. */
export const nextInternalBarcodeSeq = (
  prefix: string,
  existingBarcodes: (string | null)[],
): number => {
  let max = 0;
  for (const barcode of existingBarcodes) {
    if (!barcode) continue;
    const seq = parseInternalBarcodeSeq(prefix, barcode);
    if (seq !== null && seq > max) max = seq;
  }
  return max + 1;
};

/**
 * Código de barras Code128 (subconjunto B) — puro, sin dependencia de ninguna
 * librería de PDF/canvas. Portado de pullstok-front/src/utils/caeBarcode.ts
 * (código128BSymbols) porque api/ y pullstok-front/ son paquetes/tsconfig
 * separados y no pueden importarse entre sí; esta es la copia backend, usada
 * para imprimir etiquetas de códigos internos (ej. BLST00001).
 *
 * Code128B cubre los 95 caracteres imprimibles ASCII (32-127), suficiente
 * para un texto de etiqueta alfanumérico en mayúsculas.
 */

const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

export const START_B = 104;
export const STOP = 106;
export const SYMBOL_MODULES = 11;
export const STOP_MODULES = 13;

export { CODE128_PATTERNS };

/** Secuencia de símbolos Code128B (incluye start, checksum y stop) para un
 * texto. Lanza si el texto no es encodable (vacío o fuera de ASCII 32-127). */
export const code128BSymbols = (value: string): number[] => {
  const text = value.trim();
  if (!text) {
    throw new Error("Valor vacío: no se puede generar el código de barras");
  }
  const data: number[] = [];
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code < 32 || code > 127) {
      throw new Error(`No encodable en Code128B: "${char}"`);
    }
    data.push(code - 32);
  }
  let checksum = START_B;
  data.forEach((valueCode, index) => {
    checksum = (checksum + valueCode * (index + 1)) % 103;
  });
  return [START_B, ...data, checksum, STOP];
};

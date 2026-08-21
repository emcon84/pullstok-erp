import jsPDF from "jspdf";

/**
 * Código de barras Code128 (subconjunto B) para el CAE de la factura.
 *
 * Implementación manual (sin dependencia de canvas/JSBarcode): Code128B
 * cubre los 95 caracteres imprimibles ASCII (32-127), de modo que un CAE
 * numérico de 14 dígitos se codifica sin problemas y es 100% testeable en
 * jsdom (jsbarcode exigiría canvas, que no existe en jsdom y obligaría a
 * mockear la lib completa).
 *
 * Formato de cada símbolo: secuencia de anchos de barra/espacio en módulos
 * (ej. StartB "211214" = barra2, espacio1, barra1, espacio2, barra1,
 * espacio4). Las barras son los elementos en posición par. El checksum se
 * calcula con peso 1..N sobre los símbolos de datos (sin el start).
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

const START_B = 104;
const STOP = 106;
const SYMBOL_MODULES = 11;
const STOP_MODULES = 13;

/** Secuencia de símbolos Code128B (incluye start, checksum y stop) para un
 * texto. Lanza si el texto no es encodable (vacío o fuera de ASCII 32-127). */
export const code128BSymbols = (value: string): number[] => {
  const text = value.trim();
  if (!text) {
    throw new Error("CAE vacío: no se puede generar el código de barras");
  }
  const data: number[] = [];
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code < 32 || code > 127) {
      throw new Error(`CAE no encodable en Code128B: "${char}"`);
    }
    data.push(code - 32);
  }
  let checksum = START_B;
  data.forEach((valueCode, index) => {
    checksum = (checksum + valueCode * (index + 1)) % 103;
  });
  return [START_B, ...data, checksum, STOP];
};

/**
 * Dibuja el código de barras Code128 del CAE con doc.rect (barras negras
 * sobre fondo blanco). El ancho total de la barra es exactamente `width`;
 * la altura se fija en 40pt. Si la codificación falla, lanza — el caller
 * decide el fallback (dibujar el CAE como texto).
 */
export const drawCaeBarcode = (
  doc: jsPDF,
  value: string,
  x: number,
  y: number,
  width: number,
): void => {
  const symbols = code128BSymbols(value);
  const barHeight = 40;
  const totalModules = symbols.reduce(
    (acc, symbol) => acc + (symbol === STOP ? STOP_MODULES : SYMBOL_MODULES),
    0,
  );
  const moduleWidth = width / totalModules;
  doc.setFillColor(0, 0, 0);
  let cursor = x;
  for (const symbol of symbols) {
    const pattern = CODE128_PATTERNS[symbol];
    if (!pattern) {
      throw new Error(`Símbolo Code128 inválido: ${symbol}`);
    }
    for (let i = 0; i < pattern.length; i++) {
      const barWidth = Number(pattern[i]) * moduleWidth;
      if (i % 2 === 0) {
        doc.rect(cursor, y, barWidth, barHeight, "F");
      }
      cursor += barWidth;
    }
  }
};
import { getQrMatrix, type AfipQrPayload } from "./afipQr";

/**
 * Genera la imagen PNG del código QR fiscal AFIP (RG 4892/2020) como data
 * URL, lista para usar como src de un <img> dentro del comprobante
 * imprimible (PrintInvoice). Dibuja la matriz de módulos devuelta por
 * `getQrMatrix` (la misma lógica que `drawAfipQr`, deuda técnica item 4) en
 * un <canvas> oculto (con quiet zone de 4 módulos) y devuelve
 * canvas.toDataURL("image/png").
 *
 * Devuelve null y NUNCA lanza cuando el canvas no está disponible (jsdom
 * no implementa getContext, o un navegador sin canvas) o cuando el payload
 * es inválido (getQrMatrix valida los datos obligatorios) — el caller
 * cae al fallback de mostrar el CAE como texto grande, igual que el PDF
 * histórico en exportToPDF.ts.
 */
export const generateAfipQrDataUrl = (payload: AfipQrPayload): string | null => {
  try {
    const { moduleCount, isDark } = getQrMatrix(payload);

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const margin = 4;
    const size = 300;
    canvas.width = size;
    canvas.height = size;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#000000";

    const total = moduleCount + margin * 2;
    const cell = size / total;
    for (let row = 0; row < moduleCount; row++) {
      for (let col = 0; col < moduleCount; col++) {
        if (isDark(row, col)) {
          ctx.fillRect(
            Math.round((col + margin) * cell),
            Math.round((row + margin) * cell),
            Math.ceil(cell),
            Math.ceil(cell),
          );
        }
      }
    }

    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
};
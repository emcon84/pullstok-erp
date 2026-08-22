import jsPDF from "jspdf";
import qrcode from "qrcode-generator";

/**
 * Código QR fiscal AFIP (RG 4892/2020) — reemplaza al código de barras
 * Code128 histórico (caeBarcode.ts) como elemento obligatorio del
 * comprobante. El QR codifica la URL de verificación:
 *
 *   https://www.afip.gob.ar/fe/qr/?p=<base64(JSON)>
 *
 * donde el JSON tiene la forma fija que publica AFIP en el Anexo de la
 * RG 4892/2020 (ver, fecha, cuit, ptoVta, tipoCmp, nroCmp, importe, moneda,
 * ctz, tipoDocRec, nroDocRec, tipoCodAut, codAut).
 *
 * Implementación con `qrcode-generator` (JS puro, sin dependencia de
 * canvas): la librería expone la matriz de módulos vía `isDark(row, col)`,
 * que dibujamos módulo a módulo con `doc.rect()` — el mismo patrón que
 * `drawCaeBarcode` en caeBarcode.ts, así queda 100% testeable en jsdom.
 */

export interface AfipQrPayload {
  /** Fecha de emisión del comprobante, formato YYYY-MM-DD. */
  fecha: string;
  /** CUIT del emisor (solo dígitos). */
  cuit: number;
  ptoVta: number;
  /** Código de comprobante AFIP: "1"=Factura A, "6"=Factura B → número. */
  tipoCmp: number;
  nroCmp: number;
  importe: number;
  /** Default "PES" si no se especifica. */
  moneda?: string;
  /** Cotización de la moneda. Default 1 (pesos). */
  ctz?: number;
  /** Tipo de documento del receptor (80=CUIT, 96=DNI, 99=sin identificar).
   * Default 99/0 (consumidor final sin identificar) si falta. */
  tipoDocRec?: number | null;
  nroDocRec?: number | null;
  /** Tipo de código de autorización: "E"=CAE. Default "E". */
  tipoCodAut?: string;
  /** CAE otorgado por AFIP/ARCA. */
  codAut: number;
}

interface AfipQrJson {
  ver: 1;
  fecha: string;
  cuit: number;
  ptoVta: number;
  tipoCmp: number;
  nroCmp: number;
  importe: number;
  moneda: string;
  ctz: number;
  tipoDocRec: number;
  nroDocRec: number;
  tipoCodAut: string;
  codAut: number;
}

const AFIP_QR_BASE_URL = "https://www.afip.gob.ar/fe/qr/?p=";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** Valida el payload y aplica los defaults del spec AFIP. Lanza si falta
 * algún dato obligatorio (fecha, cuit, ptoVta, tipoCmp, nroCmp, importe o
 * codAut/CAE) — el caller decide el fallback (CAE como texto). */
const normalizePayload = (payload: AfipQrPayload): AfipQrJson => {
  if (!payload.fecha || !/^\d{4}-\d{2}-\d{2}$/.test(payload.fecha)) {
    throw new Error("QR AFIP: fecha inválida (se espera YYYY-MM-DD)");
  }
  if (!isFiniteNumber(payload.cuit)) {
    throw new Error("QR AFIP: cuit del emisor inválido");
  }
  if (!isFiniteNumber(payload.ptoVta)) {
    throw new Error("QR AFIP: punto de venta inválido");
  }
  if (!isFiniteNumber(payload.tipoCmp)) {
    throw new Error("QR AFIP: tipo de comprobante inválido");
  }
  if (!isFiniteNumber(payload.nroCmp)) {
    throw new Error("QR AFIP: número de comprobante inválido");
  }
  if (!isFiniteNumber(payload.importe)) {
    throw new Error("QR AFIP: importe inválido");
  }
  if (!isFiniteNumber(payload.codAut)) {
    throw new Error("QR AFIP: CAE inválido");
  }

  return {
    ver: 1,
    fecha: payload.fecha,
    cuit: payload.cuit,
    ptoVta: payload.ptoVta,
    tipoCmp: payload.tipoCmp,
    nroCmp: payload.nroCmp,
    importe: payload.importe,
    moneda: payload.moneda ?? "PES",
    ctz: payload.ctz ?? 1,
    tipoDocRec: isFiniteNumber(payload.tipoDocRec) ? payload.tipoDocRec : 99,
    nroDocRec: isFiniteNumber(payload.nroDocRec) ? payload.nroDocRec : 0,
    tipoCodAut: payload.tipoCodAut ?? "E",
    codAut: payload.codAut,
  };
};

/** Base64 UTF-8 safe, funciona en browser (btoa) y en Node/vitest (Buffer).
 * Evita el patrón deprecado unescape/escape: pasa por bytes UTF-8 reales
 * (TextEncoder) y arma el string binario que btoa espera. */
const base64Encode = (value: string): string => {
  const bytes = new TextEncoder().encode(value);
  if (typeof btoa === "function") {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }
  return Buffer.from(bytes).toString("base64");
};

/** Construye la URL completa que codifica el QR fiscal AFIP. Lanza si el
 * payload no tiene los datos obligatorios (mismo criterio que drawAfipQr). */
export const buildAfipQrUrl = (payload: AfipQrPayload): string => {
  const json = normalizePayload(payload);
  return `${AFIP_QR_BASE_URL}${base64Encode(JSON.stringify(json))}`;
};

/**
 * Matriz de módulos del QR fiscal (extraída para que ambos motores de dibujo
 * — jsPDF `drawAfipQr` y canvas `generateAfipQrDataUrl` — compartan la UNA
 * lógica de generación del QR y no dupliquen `qrcode-generator` + la
 * iteración de módulos; deuda técnica item 4).
 *
 * Devuelve la cantidad de módulos (moduleCount) y un predicado isDark(row,col).
 * Lanza si el payload es inválido (buildAfipQrUrl valida los obligatorios).
 */
export const getQrMatrix = (
  payload: AfipQrPayload,
): { moduleCount: number; isDark: (row: number, col: number) => boolean } => {
  const url = buildAfipQrUrl(payload);
  const qr = qrcode(0, "M");
  qr.addData(url);
  qr.make();
  return {
    moduleCount: qr.getModuleCount(),
    isDark: (row, col) => qr.isDark(row, col),
  };
};

/**
 * Dibuja el QR fiscal AFIP con doc.rect() (módulos oscuros sobre fondo
 * blanco, sin canvas). Ocupa exactamente `size x size` puntos en (x, y).
 * Corrección de errores nivel M. Lanza si el payload es inválido — el
 * caller decide el fallback (mostrar el CAE como texto).
 */
export const drawAfipQr = (
  doc: jsPDF,
  payload: AfipQrPayload,
  x: number,
  y: number,
  size: number,
): void => {
  const { moduleCount, isDark } = getQrMatrix(payload);
  const cellSize = size / moduleCount;

  doc.setFillColor(0, 0, 0);
  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (isDark(row, col)) {
        doc.rect(x + col * cellSize, y + row * cellSize, cellSize, cellSize, "F");
      }
    }
  }
};

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { drawCaeBarcode } from "./caeBarcode";
import { drawAfipQr, type AfipQrPayload } from "./afipQr";

interface ExportItem {
  quantity: number;
  name: string;
  price: number;
  total: number;
}

interface ExportData {
  title: string;
  documentNumber: string;
  date: string;
  customer?: string;
  items: ExportItem[];
  total: number;
}

/**
 * sdd/facturacion-servicios, WS5 — extensión "comprobante fiscal" del PDF.
 *
 * Backwards-compatible a propósito: ExportData/ExportItem (usados hoy por
 * Quotations, Comprobations, Sales, Invoices, Orders, Statistics vía
 * buildExport(...)) quedan intactos. InvoicePdfData EXTIENDE ExportData
 * agregando campos todos opcionales, y InvoicePdfItem extiende ExportItem
 * con taxRate opcional. exportToPDF(data) sigue aceptando ExportData puro
 * (los campos nuevos simplemente vienen undefined) — ningún call site
 * existente necesita cambios.
 *
 * Regla de layout: si data.cae viene presente, se dibuja un comprobante
 * fiscal ESTÁNDAR (estilo AFIP/ARCA, acercado al diseño real de un
 * comprobante impreso):
 *   1. Rótulo "ORIGINAL" centrado arriba de todo.
 *   2. Header en 3 columnas: emisor (izq) — recuadro con la letra del
 *      comprobante A/B (centro) — tipo de comprobante + número + fecha
 *      (der).
 *   3. Receptor.
 *   4. Tabla de items.
 *   5. Zona CAE al pie con código QR AFIP (RG 4892/2020, reemplaza al
 *      código de barras Code128 histórico) + CAE + vencimiento + leyenda
 *      "Comprobante autorizado por ARCA".
 * Sin CAE se mantiene el PDF genérico histórico con la leyenda
 * "Comprobante no fiscal".
 */
export interface InvoicePdfIssuer {
  name?: string;
  taxId?: string;
  taxCondition?: string;
  address?: string;
}

export interface InvoicePdfItem extends ExportItem {
  taxRate?: number;
}

export interface InvoicePdfData extends ExportData {
  items: InvoicePdfItem[];
  issuer?: InvoicePdfIssuer;
  customerTaxId?: string;
  customerTaxCondition?: string;
  customerAddress?: string;
  /** Desglose de totales para el footer (si no viene, se muestra solo el total). */
  subtotal?: number;
  taxAmount?: number;
  /** Código ARCA del comprobante: "1"=Factura A, "6"=Factura B. */
  tipoComprobante?: string | null;
  puntoVenta?: number | null;
  cbteNro?: number | null;
  /** CAE otorgado por ARCA. Presente ⇒ layout fiscal estándar. */
  cae?: string | null;
  caeVencimiento?: string | null;
  /** Tipo de documento del receptor (80=CUIT, 96=DNI, 99=sin identificar).
   * Requerido por el QR fiscal AFIP (RG 4892/2020); si falta, el QR asume
   * consumidor final sin identificar (99/0). */
  docTipoReceptor?: number | null;
  docNroReceptor?: string | null;
  /** Logo del emisor (AppBranding.logoUrl). Opcional: si no puede cargarse
   * (fetch falla, no es imagen válida, jsdom sin canvas) se omite y se
   * sigue dibujando el comprobante sin logo. */
  logoUrl?: string | null;
}

export { drawCaeBarcode };

const MISSING_LABEL = "(sin datos fiscales)";
const FISCAL_LEGEND = "Comprobante autorizado por ARCA";
const NON_FISCAL_LEGEND = "Comprobante no fiscal — no válido como factura AFIP";

const CAE_BOX_X = 14;
const CAE_BOX_W = 300;
const CAE_BOX_H = 100;
const RIGHT_X = 581;
const LEFT_X = 14;
/** Recuadro con la letra del comprobante (A/B), centrado entre el bloque
 * del emisor y el bloque de tipo/número/fecha — igual al diseño real AFIP. */
const LETTER_BOX_X = 258;
const LETTER_BOX_W = 62;
const LETTER_BOX_H = 62;
/** Tamaño del QR fiscal AFIP dentro de la zona CAE. */
const QR_SIZE = 66;

const fiscalField = (value?: string | null) =>
  value && value.trim() ? value : MISSING_LABEL;

/** Normaliza una fecha a DD/MM/YYYY (acepta ISO, Date-parseable o ya
 * formateada). Si no puede parsearse, devuelve el valor crudo. */
const formatDate = (value?: string | null): string => {
  if (!value) return "-";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return value;
  // Fechas ISO date-only (YYYY-MM-DD): se parsean como fecha local para no
  // correrse un día en husos con offset negativo (new Date las lee como UTC).
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso) {
    return `${iso[3]}/${iso[2]}/${iso[1]}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getFullYear()}`;
};

/** Convierte una fecha visible (DD/MM/YYYY, ya normalizada por formatDate,
 * o cualquier formato Date-parseable) al formato YYYY-MM-DD que exige el
 * JSON del QR fiscal AFIP. Si no puede derivarse, usa la fecha actual —
 * el QR nunca debe romperse por un formato de fecha inesperado. */
const toIsoDate = (value?: string | null): string => {
  const ddmmyyyy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value ?? "");
  if (ddmmyyyy) return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (iso) return value as string;
  const parsed = value ? new Date(value) : null;
  if (parsed && !Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
};

/** Número fiscal visible "0002-00000013" (puntoVenta 4 díg. + cbteNro 8 díg.). */
const fiscalNumber = (data: InvoicePdfData): string | null =>
  data.puntoVenta != null && data.cbteNro != null
    ? `${String(data.puntoVenta).padStart(4, "0")}-${String(data.cbteNro).padStart(8, "0")}`
    : null;

/** Arma el payload del QR fiscal AFIP (RG 4892/2020) a partir de los datos
 * del comprobante. drawAfipQr valida los campos obligatorios y lanza si
 * falta alguno (cuit emisor, ptoVta, tipoCmp, nroCmp o CAE) — el caller
 * hace el fallback a texto, igual que con el barcode histórico. */
const buildAfipQrPayload = (data: InvoicePdfData): AfipQrPayload => {
  const cuitDigits = data.issuer?.taxId?.replace(/\D/g, "") ?? "";
  const docNroDigits = data.docNroReceptor?.replace(/\D/g, "") ?? "";
  return {
    fecha: toIsoDate(data.date),
    cuit: cuitDigits ? Number(cuitDigits) : NaN,
    ptoVta: data.puntoVenta ?? NaN,
    tipoCmp: data.tipoComprobante ? Number(data.tipoComprobante) : NaN,
    nroCmp: data.cbteNro ?? NaN,
    importe: data.total,
    tipoDocRec: data.docTipoReceptor ?? undefined,
    nroDocRec: docNroDigits ? Number(docNroDigits) : undefined,
    codAut: data.cae ? Number(data.cae) : NaN,
  };
};

const comprobanteTitle = (data: InvoicePdfData): string =>
  data.tipoComprobante === "1"
    ? "FACTURA A"
    : data.tipoComprobante === "6"
      ? "FACTURA B"
      : (data.title || "FACTURA").toUpperCase();

/** Letra del comprobante para el recuadro central del header (A/B). Vacía
 * si todavía no hay tipoComprobante asignado (no debería ocurrir con CAE
 * presente, pero no debe romper el layout si pasara). */
const comprobanteLetter = (data: InvoicePdfData): string =>
  data.tipoComprobante === "1" ? "A" : data.tipoComprobante === "6" ? "B" : "";

/** Carga una URL de imagen como data URL (blob → FileReader). Devuelve null
 * ante cualquier error (fetch, MIME no-imagen, jsdom sin FileReader real). */
const loadLogoDataUrl = async (url: string): Promise<string | null> => {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () =>
        resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.onabort = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

/** Dibuja el logo en la esquina superior izquierda, a partir de `y`.
 * Devuelve si se dibujó. */
const drawLogo = async (
  doc: jsPDF,
  logoUrl: string | null | undefined,
  y: number,
): Promise<boolean> => {
  if (!logoUrl) return false;
  try {
    const dataUrl = await loadLogoDataUrl(logoUrl);
    if (!dataUrl) return false;
    const mime = dataUrl.split(";")[0].split(":")[1];
    const format =
      mime === "image/png" ? "PNG" : mime === "image/jpeg" ? "JPEG" : undefined;
    if (!format) return false;
    doc.addImage(dataUrl, format, LEFT_X, y, 42, 42);
    return true;
  } catch {
    return false;
  }
};

/** Rótulo "ORIGINAL" centrado arriba de todo el comprobante, dentro de un
 * recuadro delgado — igual al diseño real de las facturas AFIP impresas
 * (donde el mismo lugar dice "DUPLICADO"/"TRIPLICADO" según la copia).
 * Devuelve el Y donde puede arrancar el resto del header. */
const drawOriginalBand = (doc: jsPDF): number => {
  const width = 90;
  const height = 14;
  const x = (RIGHT_X + LEFT_X - width) / 2;
  const y = 10;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.rect(x, y, width, height);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("ORIGINAL", x + width / 2, y + height / 2 + 3, { align: "center" });
  return y + height + 8;
};

/** Header fiscal en 3 columnas: emisor (izq) — recuadro con la letra del
 * comprobante A/B (centro) — tipo de comprobante, número fiscal y fecha
 * (der). Línea separadora al pie. Devuelve el Y donde arranca el receptor. */
const drawFiscalHeader = (
  doc: jsPDF,
  data: InvoicePdfData,
  hasLogo: boolean,
  topY: number,
): number => {
  const leftY = hasLogo ? topY + 50 : topY + 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(fiscalField(data.issuer?.name), LEFT_X, leftY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`CUIT: ${fiscalField(data.issuer?.taxId)}`, LEFT_X, leftY + 7);
  doc.text(`Condición IVA: ${fiscalField(data.issuer?.taxCondition)}`, LEFT_X, leftY + 12);
  doc.text(`Domicilio: ${fiscalField(data.issuer?.address)}`, LEFT_X, leftY + 17);

  // Recuadro con la letra del comprobante, centrado entre emisor y der.
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.75);
  doc.rect(LETTER_BOX_X, topY, LETTER_BOX_W, LETTER_BOX_H);
  const letter = comprobanteLetter(data);
  if (letter) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(40);
    doc.text(letter, LETTER_BOX_X + LETTER_BOX_W / 2, topY + LETTER_BOX_H / 2 + 14, {
      align: "center",
    });
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(comprobanteTitle(data), RIGHT_X, topY + 12, { align: "right" });
  doc.setFontSize(11);
  doc.text(fiscalNumber(data) ?? data.documentNumber, RIGHT_X, topY + 22, {
    align: "right",
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Fecha de emisión: ${data.date}`, RIGHT_X, topY + 30, { align: "right" });
  if (data.puntoVenta != null) {
    doc.text(
      `Punto de venta: ${String(data.puntoVenta).padStart(4, "0")}`,
      RIGHT_X,
      topY + 37,
      { align: "right" },
    );
  }

  const headerBottom = Math.max(leftY + 20, topY + LETTER_BOX_H, topY + 42);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.line(LEFT_X, headerBottom, RIGHT_X, headerBottom);
  return headerBottom + 8;
};

/** Bloque receptor del comprobante fiscal. Devuelve el Y de la tabla. */
const drawReceptor = (doc: jsPDF, data: InvoicePdfData, y: number): number => {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`Cliente: ${data.customer || MISSING_LABEL}`, 14, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`CUIT: ${fiscalField(data.customerTaxId)}`, 14, y + 6);
  doc.text(`Condición IVA: ${fiscalField(data.customerTaxCondition)}`, 14, y + 11);
  doc.text(`Domicilio: ${fiscalField(data.customerAddress)}`, 14, y + 16);
  return y + 22;
};

/** Zona CAE al pie: recuadro con CAE, vencimiento y código QR fiscal AFIP
 * (RG 4892/2020). Si el QR no puede generarse (faltan datos obligatorios
 * del payload), se dibuja el CAE como texto grande en su lugar. */
const drawCaeZone = (doc: jsPDF, data: InvoicePdfData, y: number): void => {
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.rect(CAE_BOX_X, y, CAE_BOX_W, CAE_BOX_H);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(`CAE: ${data.cae}`, CAE_BOX_X + 6, y + 10);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Vencimiento CAE: ${formatDate(data.caeVencimiento)}`, CAE_BOX_X + 6, y + 16);

  const qrX = CAE_BOX_X + 8;
  const qrY = y + 24;
  try {
    drawAfipQr(doc, buildAfipQrPayload(data), qrX, qrY, QR_SIZE);
    const legendX = qrX + QR_SIZE + 12;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("AFIP - Comprobante Autorizado", legendX, qrY + 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text("Verificá este comprobante en", legendX, qrY + 24);
    doc.text("www.afip.gob.ar/fe/qr", legendX, qrY + 32);
  } catch {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(data.cae ?? "", CAE_BOX_X + 6, y + 42);
  }
};

interface TableContent {
  head: string[];
  body: string[][];
  foot: string[][];
}

const buildTable = (data: InvoicePdfData): TableContent => {
  const hasTaxRateColumn = data.items.some((item) => item.taxRate !== undefined);

  const head = hasTaxRateColumn
    ? ["Cantidad", "Descripción", "Precio Unit.", "IVA %", "Subtotal"]
    : ["Cantidad", "Descripción", "Precio Unit.", "Total"];

  const body = data.items.map((item) => {
    const pdfItem = item as InvoicePdfItem;
    const row = [item.quantity.toString(), item.name, `$${item.price.toFixed(2)}`];
    if (hasTaxRateColumn) {
      row.push(pdfItem.taxRate !== undefined ? `${pdfItem.taxRate}%` : "-");
    }
    row.push(`$${item.total.toFixed(2)}`);
    return row;
  });

  const blankCols = hasTaxRateColumn ? 3 : 2;
  const foot: string[][] = [];
  if (data.subtotal !== undefined && data.taxAmount !== undefined) {
    foot.push([...Array(blankCols).fill(""), "Subtotal:", `$${data.subtotal.toFixed(2)}`]);
    foot.push([...Array(blankCols).fill(""), "IVA:", `$${data.taxAmount.toFixed(2)}`]);
    foot.push([...Array(blankCols).fill(""), "Total:", `$${data.total.toFixed(2)}`]);
  } else {
    foot.push([...Array(blankCols).fill(""), "Total:", `$${data.total.toFixed(2)}`]);
  }

  return { head, body, foot };
};

const drawTable = (
  doc: jsPDF,
  data: InvoicePdfData,
  startY: number,
  fiscal: boolean,
): void => {
  const { head, body, foot } = buildTable(data);

  autoTable(doc, {
    startY,
    head: [head],
    body,
    foot,
    theme: "grid",
    headStyles: fiscal
      ? {
          fillColor: [229, 231, 235],
          textColor: [17, 24, 39],
          fontStyle: "bold",
        }
      : {
          fillColor: [99, 102, 241],
          textColor: [255, 255, 255],
          fontStyle: "bold",
        },
    footStyles: {
      fillColor: [243, 244, 246],
      textColor: [17, 24, 39],
      fontStyle: "bold",
      fontSize: 12,
    },
    didDrawPage: () => {
      // Leyenda al pie de cada página: "autorizado por ARCA" si el
      // comprobante tiene CAE; "no fiscal" en el PDF genérico (WS5.4).
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(fiscal ? FISCAL_LEGEND : NON_FISCAL_LEGEND, 14, pageHeight - 10);
      doc.setTextColor(0, 0, 0);
    },
  });
};

/** PDF genérico histórico (sin CAE): título, datos del documento, header
 * fiscal del emisor/cliente cuando viene, tabla y leyenda "no fiscal". */
const drawGeneric = (doc: jsPDF, data: InvoicePdfData): void => {
  const hasFiscalData = Boolean(
    data.issuer ||
      data.customerTaxId ||
      data.customerTaxCondition ||
      data.customerAddress,
  );

  doc.setFontSize(20);
  doc.text(data.title, 14, 22);

  doc.setFontSize(12);
  doc.text(`Número: ${data.documentNumber}`, 14, 32);
  doc.text(`Fecha: ${data.date}`, 14, 39);

  let cursorY = 46;

  // Header fiscal del emisor (regla dura de spec: si falta un dato, se marca
  // "(sin datos fiscales)" pero NUNCA se bloquea la generación del PDF).
  if (hasFiscalData) {
    doc.setFontSize(9);
    doc.text(
      `Emisor: ${fiscalField(data.issuer?.name)} — CUIT/Tax ID: ${fiscalField(data.issuer?.taxId)}`,
      14,
      cursorY,
    );
    cursorY += 5;
    doc.text(
      `Cond. IVA emisor: ${fiscalField(data.issuer?.taxCondition)} — Domicilio: ${fiscalField(data.issuer?.address)}`,
      14,
      cursorY,
    );
    cursorY += 7;
    doc.setFontSize(12);
  }

  if (data.customer) {
    doc.text(`Cliente: ${data.customer}`, 14, cursorY);
    cursorY += 7;
  }

  if (hasFiscalData) {
    doc.setFontSize(9);
    doc.text(
      `CUIT/Tax ID cliente: ${fiscalField(data.customerTaxId)} — Cond. IVA: ${fiscalField(data.customerTaxCondition)}`,
      14,
      cursorY,
    );
    cursorY += 5;
    if (data.customerAddress !== undefined) {
      doc.text(`Domicilio cliente: ${fiscalField(data.customerAddress)}`, 14, cursorY);
      cursorY += 5;
    }
    doc.setFontSize(12);
    cursorY += 2;
  }

  drawTable(doc, data, cursorY, false);
};

export const exportToPDF = async (
  data: ExportData | InvoicePdfData,
): Promise<void> => {
  const pdfData = data as InvoicePdfData;
  const hasCae = Boolean(pdfData.cae);

  // El layout fiscal usa pt (A4 595x842) para las coordenadas del estándar
  // AFIP; el PDF genérico conserva la unidad por defecto (mm) para no
  // alterar la salida histórica.
  const doc = new jsPDF(hasCae ? { unit: "pt", format: "a4" } : {});

  if (hasCae) {
    const bandBottom = drawOriginalBand(doc);
    const hasLogo = await drawLogo(doc, pdfData.logoUrl, bandBottom);
    const headerBottom = drawFiscalHeader(doc, pdfData, hasLogo, bandBottom);
    const tableStartY = drawReceptor(doc, pdfData, headerBottom);
    drawTable(doc, pdfData, tableStartY, true);

    const tableEndY = (doc as unknown as { lastAutoTable?: { finalY: number } })
      .lastAutoTable?.finalY ?? tableStartY + 20;
    const pageHeight = doc.internal.pageSize.getHeight();
    let caeY = tableEndY + 10;
    if (caeY + CAE_BOX_H > pageHeight - 20) {
      doc.addPage();
      caeY = 14;
    }
    drawCaeZone(doc, pdfData, caeY);
  } else {
    drawGeneric(doc, pdfData);
  }

  doc.save(`${data.title.replace(/\s+/g, "_")}_${data.documentNumber}.pdf`);
};
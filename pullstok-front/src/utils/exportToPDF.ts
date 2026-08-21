import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { drawCaeBarcode } from "./caeBarcode";

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
 * fiscal ESTÁNDAR (estilo AFIP/ARCA: header de emisor con logo, título y
 * número fiscal a la derecha, receptor, tabla, zona CAE con código de
 * barras Code128 y leyenda "Comprobante autorizado por ARCA"). Sin CAE se
 * mantiene el PDF genérico histórico con la leyenda "Comprobante no fiscal".
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
const CAE_BOX_H = 96;
const RIGHT_X = 581;

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

/** Número fiscal visible "0002-00000013" (puntoVenta 4 díg. + cbteNro 8 díg.). */
const fiscalNumber = (data: InvoicePdfData): string | null =>
  data.puntoVenta != null && data.cbteNro != null
    ? `${String(data.puntoVenta).padStart(4, "0")}-${String(data.cbteNro).padStart(8, "0")}`
    : null;

const comprobanteTitle = (data: InvoicePdfData): string =>
  data.tipoComprobante === "1"
    ? "FACTURA A"
    : data.tipoComprobante === "6"
      ? "FACTURA B"
      : (data.title || "FACTURA").toUpperCase();

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

/** Dibuja el logo en la esquina superior izquierda. Devuelve si se dibujó. */
const drawLogo = async (
  doc: jsPDF,
  logoUrl?: string | null,
): Promise<boolean> => {
  if (!logoUrl) return false;
  try {
    const dataUrl = await loadLogoDataUrl(logoUrl);
    if (!dataUrl) return false;
    const mime = dataUrl.split(";")[0].split(":")[1];
    const format =
      mime === "image/png" ? "PNG" : mime === "image/jpeg" ? "JPEG" : undefined;
    if (!format) return false;
    doc.addImage(dataUrl, format, 14, 14, 42, 42);
    return true;
  } catch {
    return false;
  }
};

/** Header fiscal: logo + datos del emisor a la izquierda, título y número
 * fiscal a la derecha, línea separadora al pie. Devuelve el Y donde arranca
 * el bloque del receptor. */
const drawFiscalHeader = (doc: jsPDF, data: InvoicePdfData, hasLogo: boolean): number => {
  const leftY = hasLogo ? 64 : 14;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(fiscalField(data.issuer?.name), 14, leftY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`CUIT: ${fiscalField(data.issuer?.taxId)}`, 14, leftY + 7);
  doc.text(`Condición IVA: ${fiscalField(data.issuer?.taxCondition)}`, 14, leftY + 12);
  doc.text(`Domicilio: ${fiscalField(data.issuer?.address)}`, 14, leftY + 17);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(comprobanteTitle(data), RIGHT_X, 22, { align: "right" });
  doc.setFontSize(11);
  doc.text(fiscalNumber(data) ?? data.documentNumber, RIGHT_X, 30, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Fecha de emisión: ${data.date}`, RIGHT_X, 37, { align: "right" });
  if (data.puntoVenta != null) {
    doc.text(
      `Punto de venta: ${String(data.puntoVenta).padStart(4, "0")}`,
      RIGHT_X,
      42,
      { align: "right" },
    );
  }

  const headerBottom = Math.max(leftY + 20, 46);
  doc.setDrawColor(0, 0, 0);
  doc.line(14, headerBottom, RIGHT_X, headerBottom);
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

/** Zona CAE al pie: recuadro con CAE, vencimiento y código de barras
 * Code128. Si el barcode falla, se dibuja el CAE como texto grande. */
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
  try {
    drawCaeBarcode(doc, data.cae ?? "", CAE_BOX_X + 8, y + 22, CAE_BOX_W - 16);
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
    const hasLogo = await drawLogo(doc, pdfData.logoUrl);
    const headerBottom = drawFiscalHeader(doc, pdfData, hasLogo);
    const tableStartY = drawReceptor(doc, pdfData, headerBottom);
    drawTable(doc, pdfData, tableStartY, true);

    const tableEndY = doc.lastAutoTable?.finalY ?? tableStartY + 20;
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
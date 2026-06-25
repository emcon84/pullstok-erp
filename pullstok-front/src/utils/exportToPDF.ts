import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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
}

const MISSING_LABEL = "(sin datos fiscales)";

const fiscalField = (value?: string | null) =>
  value && value.trim() ? value : MISSING_LABEL;

export const exportToPDF = (data: ExportData | InvoicePdfData) => {
  const doc = new jsPDF();
  const pdfData = data as InvoicePdfData;
  const hasFiscalData = Boolean(
    pdfData.issuer ||
      pdfData.customerTaxId ||
      pdfData.customerTaxCondition ||
      pdfData.customerAddress,
  );

  // Título
  doc.setFontSize(20);
  doc.text(data.title, 14, 22);

  // Información del documento
  doc.setFontSize(12);
  doc.text(`Número: ${data.documentNumber}`, 14, 32);
  doc.text(`Fecha: ${data.date}`, 14, 39);

  let cursorY = 46;

  // Header fiscal del emisor (regla dura de spec: si falta un dato, se marca
  // "(sin datos fiscales)" pero NUNCA se bloquea la generación del PDF).
  if (hasFiscalData) {
    doc.setFontSize(9);
    doc.text(
      `Emisor: ${fiscalField(pdfData.issuer?.name)} — CUIT/Tax ID: ${fiscalField(
        pdfData.issuer?.taxId,
      )}`,
      14,
      cursorY,
    );
    cursorY += 5;
    doc.text(
      `Cond. IVA emisor: ${fiscalField(
        pdfData.issuer?.taxCondition,
      )} — Domicilio: ${fiscalField(pdfData.issuer?.address)}`,
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
      `CUIT/Tax ID cliente: ${fiscalField(
        pdfData.customerTaxId,
      )} — Cond. IVA: ${fiscalField(pdfData.customerTaxCondition)}`,
      14,
      cursorY,
    );
    cursorY += 5;
    if (pdfData.customerAddress !== undefined) {
      doc.text(`Domicilio cliente: ${fiscalField(pdfData.customerAddress)}`, 14, cursorY);
      cursorY += 5;
    }
    doc.setFontSize(12);
    cursorY += 2;
  }

  const hasTaxRateColumn = pdfData.items.some((item) => item.taxRate !== undefined);

  // Tabla de productos (con columna IVA% cuando hay datos de alícuota).
  const head = hasTaxRateColumn
    ? ["Cantidad", "Descripción", "Precio Unit.", "IVA %", "Subtotal"]
    : ["Cantidad", "Descripción", "Precio Unit.", "Total"];

  const body = data.items.map((item) => {
    const pdfItem = item as InvoicePdfItem;
    const row = [
      item.quantity.toString(),
      item.name,
      `$${item.price.toFixed(2)}`,
    ];
    if (hasTaxRateColumn) {
      row.push(pdfItem.taxRate !== undefined ? `${pdfItem.taxRate}%` : "-");
    }
    row.push(`$${item.total.toFixed(2)}`);
    return row;
  });

  // Footer: si tenemos desglose (subtotal/IVA), se muestran 3 líneas; si no,
  // se mantiene el comportamiento histórico de una sola línea de Total.
  const foot: string[][] = [];
  if (pdfData.subtotal !== undefined && pdfData.taxAmount !== undefined) {
    const blankCols = hasTaxRateColumn ? 3 : 2;
    foot.push([...Array(blankCols).fill(""), "Subtotal:", `$${pdfData.subtotal.toFixed(2)}`]);
    foot.push([...Array(blankCols).fill(""), "IVA:", `$${pdfData.taxAmount.toFixed(2)}`]);
    foot.push([...Array(blankCols).fill(""), "Total:", `$${data.total.toFixed(2)}`]);
  } else {
    const blankCols = hasTaxRateColumn ? 3 : 2;
    foot.push([...Array(blankCols).fill(""), "Total:", `$${data.total.toFixed(2)}`]);
  }

  autoTable(doc, {
    startY: cursorY,
    head: [head],
    body,
    foot,
    theme: "grid",
    headStyles: {
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
      // Leyenda fija de "comprobante no fiscal" en la esquina inferior de
      // cada página (regla de spec WS5.4).
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(
        "Comprobante no fiscal — no válido como factura AFIP",
        14,
        pageHeight - 10,
      );
      doc.setTextColor(0, 0, 0);
    },
  });

  // Descargar el PDF
  doc.save(`${data.title.replace(/\s+/g, "_")}_${data.documentNumber}.pdf`);
};

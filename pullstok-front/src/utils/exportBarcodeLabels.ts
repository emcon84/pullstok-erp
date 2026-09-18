import jsPDF from "jspdf";
import {
  code128BSymbols,
  CODE128_PATTERNS,
  STOP,
  SYMBOL_MODULES,
  STOP_MODULES,
} from "./caeBarcode";

/** Dibuja las barras Code128B (mismo loop que drawCaeBarcode de caeBarcode.ts,
 * generalizado a cualquier texto y a una altura configurable). */
const drawBarcodeBars = (
  doc: jsPDF,
  value: string,
  x: number,
  y: number,
  width: number,
  height: number,
): void => {
  const symbols = code128BSymbols(value);
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
        doc.rect(cursor, y, barWidth, height, "F");
      }
      cursor += barWidth;
    }
  }
};

export interface BarcodeLabel {
  name: string;
  barcode: string;
}

const MAX_NAME_CHARS = 26;
const truncateName = (name: string): string =>
  name.length > MAX_NAME_CHARS ? `${name.slice(0, MAX_NAME_CHARS - 1)}…` : name;

const PAGE_MARGIN = 10;
const COLS = 3;
const CELL_HEIGHT = 25;
const BARCODE_WIDTH = 45;
const BARCODE_HEIGHT = 15;

/**
 * Genera y descarga un PDF A4 con una grilla de etiquetas (nombre + código
 * Code128 real + texto legible) para pegar en el producto físico.
 */
export const exportBarcodeLabels = (labels: BarcodeLabel[]): void => {
  if (labels.length === 0) return;

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const usableWidth = pageWidth - PAGE_MARGIN * 2;
  const colWidth = usableWidth / COLS;
  const rowsPerPage = Math.floor((pageHeight - PAGE_MARGIN * 2) / CELL_HEIGHT);

  labels.forEach((label, index) => {
    const perPage = rowsPerPage * COLS;
    const indexOnPage = index % perPage;
    if (index > 0 && indexOnPage === 0) {
      doc.addPage();
    }
    const row = Math.floor(indexOnPage / COLS);
    const col = indexOnPage % COLS;

    const cellX = PAGE_MARGIN + col * colWidth;
    const cellY = PAGE_MARGIN + row * CELL_HEIGHT;
    const barcodeX = cellX + (colWidth - BARCODE_WIDTH) / 2;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(truncateName(label.name), cellX + colWidth / 2, cellY + 4, {
      align: "center",
    });

    const barcodeY = cellY + 6;
    drawBarcodeBars(doc, label.barcode, barcodeX, barcodeY, BARCODE_WIDTH, BARCODE_HEIGHT);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(label.barcode, cellX + colWidth / 2, barcodeY + BARCODE_HEIGHT + 4, {
      align: "center",
    });
  });

  doc.save("codigos-barra.pdf");
};

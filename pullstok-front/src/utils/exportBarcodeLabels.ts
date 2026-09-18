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

const NAME_MAX_LINES = 2;

/** Envuelve `text` en hasta `maxLines` líneas que entran en `maxWidth` (según
 * `measure`, con la fuente/tamaño ya seteados en el doc); si sobran palabras
 * después de la última línea, la trunca con "…" en vez de cortar el resto. */
const wrapToLines = (
  measure: (s: string) => number,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] => {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const allLines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || measure(candidate) <= maxWidth) {
      current = candidate;
    } else {
      allLines.push(current);
      current = word;
    }
  }
  if (current) allLines.push(current);

  if (allLines.length <= maxLines) return allLines;

  const kept = allLines.slice(0, maxLines - 1);
  let rest = allLines.slice(maxLines - 1).join(" ");
  while (rest.length > 0 && measure(`${rest}…`) > maxWidth) {
    rest = rest.slice(0, -1);
  }
  kept.push(`${rest.trimEnd()}…`);
  return kept;
};

const PAGE_MARGIN = 8;
const COLS = 4;
const CELL_HEIGHT = 23;
const BARCODE_WIDTH = 32;
const BARCODE_HEIGHT = 8;
const NAME_FONT_SIZE = 6.5;
const NAME_LINE_HEIGHT = 2.8;
const CODE_FONT_SIZE = 6.5;

/**
 * Genera y descarga un PDF A4 con una grilla de etiquetas chicas (nombre
 * completo en hasta 2 líneas + código Code128 + texto legible) para pegar en
 * el producto físico.
 */
export const exportBarcodeLabels = (labels: BarcodeLabel[]): void => {
  if (labels.length === 0) return;

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const usableWidth = pageWidth - PAGE_MARGIN * 2;
  const colWidth = usableWidth / COLS;
  const nameMaxWidth = colWidth - 3;
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
    const centerX = cellX + colWidth / 2;
    const barcodeX = cellX + (colWidth - BARCODE_WIDTH) / 2;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(NAME_FONT_SIZE);
    const nameLines = wrapToLines(
      (s) => doc.getTextWidth(s),
      label.name,
      nameMaxWidth,
      NAME_MAX_LINES,
    );
    nameLines.forEach((line, i) => {
      doc.text(line, centerX, cellY + 3 + i * NAME_LINE_HEIGHT, { align: "center" });
    });

    const barcodeY = cellY + 3 + NAME_MAX_LINES * NAME_LINE_HEIGHT + 1.2;
    drawBarcodeBars(doc, label.barcode, barcodeX, barcodeY, BARCODE_WIDTH, BARCODE_HEIGHT);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(CODE_FONT_SIZE);
    doc.text(label.barcode, centerX, barcodeY + BARCODE_HEIGHT + 3, {
      align: "center",
    });
  });

  doc.save("codigos-barra.pdf");
};

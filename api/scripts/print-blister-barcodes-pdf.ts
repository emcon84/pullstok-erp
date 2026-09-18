// Script: render printable Code128 labels (barcode + product name) for every
// BLISTER product that already has an invented barcode (see
// api/scripts/assign-blister-barcodes.ts, which assigns BLST##### codes).
// The owner sticks these physical labels on the blister packs so they scan
// at POS like any other product.
//
// Usage (run on VPS via ts-node, see api/prisma/scripts/README.md pattern):
//   TS_NODE_PROJECT=/var/www/pullstok/api/tsconfig.json \
//     npx ts-node --transpile-only scripts/print-blister-barcodes-pdf.ts --out ./blister-labels.pdf
import "dotenv/config";
import fs from "fs";
import PDFDocument from "pdfkit";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { code128BSymbols, CODE128_PATTERNS, STOP, STOP_MODULES, SYMBOL_MODULES } from "../src/utils/code128";
import { uploadToR2 } from "../src/config/storage";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DEFAULT_ORG = "1bc3a6c5-1d06-4e40-93ba-12d51a2a2a1b";

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const OUT_PATH = outIdx !== -1 && args[outIdx + 1] ? args[outIdx + 1] : "./blister-labels.pdf";
const orgIdArg = args.find((a, i) => !a.startsWith("--") && i !== outIdx + 1);
const TARGET_ORG = orgIdArg || DEFAULT_ORG;

const MM = 2.834645669;
const BARCODE_WIDTH = 32 * MM;
const BARCODE_HEIGHT = 8 * MM;
const COLS = 4;
const MARGIN = 24;
const CELL_PADDING = 8;
const NAME_MAX_LINES = 2;
const NAME_FONT_SIZE = 6.5;

/** Envuelve `text` en hasta `maxLines` líneas que entran en `maxWidth` (según
 * `measure`); si sobran palabras después de la última línea, la trunca con
 * "…" en vez de cortarla sin avisar. */
function wrapToLines(
  measure: (s: string) => number,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
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
}

function drawBarcode(
  doc: PDFKit.PDFDocument,
  value: string,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const symbols = code128BSymbols(value);
  const totalModules = symbols.reduce(
    (acc, symbol) => acc + (symbol === STOP ? STOP_MODULES : SYMBOL_MODULES),
    0,
  );
  const moduleWidth = width / totalModules;
  let cursor = x;
  for (const symbol of symbols) {
    const pattern = CODE128_PATTERNS[symbol];
    for (let i = 0; i < pattern.length; i++) {
      const barWidth = Number(pattern[i]) * moduleWidth;
      if (i % 2 === 0) {
        doc.rect(cursor, y, barWidth, height).fill("black");
      }
      cursor += barWidth;
    }
  }
}

async function main() {
  const products = await prisma.product.findMany({
    where: { organizationId: TARGET_ORG, name: { contains: "BLISTER", mode: "insensitive" }, barcode: { not: null } },
    select: { name: true, barcode: true },
    orderBy: { name: "asc" },
  });

  const labels = products.filter((p) => p.barcode && p.barcode.trim() !== "");

  if (labels.length === 0) {
    console.log(`No BLISTER products with a barcode found for org ${TARGET_ORG}. Nothing to print.`);
    await prisma.$disconnect();
    return;
  }

  const doc = new PDFDocument({ size: "A4", margin: MARGIN });
  const stream = fs.createWriteStream(OUT_PATH);
  doc.pipe(stream);

  const usableWidth = doc.page.width - MARGIN * 2;
  const colWidth = usableWidth / COLS;
  const cellWidth = colWidth - CELL_PADDING;

  const NAME_LINE_HEIGHT = 8;
  const nameBlockHeight = NAME_MAX_LINES * NAME_LINE_HEIGHT;
  const barcodeGap = 3;
  const codeTextHeight = 10;
  const cellHeight = nameBlockHeight + barcodeGap + BARCODE_HEIGHT + barcodeGap + codeTextHeight;

  let col = 0;
  let y = MARGIN;

  doc.font("Helvetica-Bold").fontSize(NAME_FONT_SIZE);
  const measure = (s: string) => doc.widthOfString(s);

  for (const label of labels) {
    if (col === 0 && y + cellHeight > doc.page.height - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }

    const x = MARGIN + col * colWidth;

    doc.font("Helvetica-Bold").fontSize(NAME_FONT_SIZE).fillColor("black");
    const nameLines = wrapToLines(measure, label.name, cellWidth, NAME_MAX_LINES);
    nameLines.forEach((line, i) => {
      doc.text(line, x, y + i * NAME_LINE_HEIGHT, { width: cellWidth, align: "center" });
    });

    const barcodeY = y + nameBlockHeight + barcodeGap;
    drawBarcode(doc, label.barcode as string, x, barcodeY, BARCODE_WIDTH, BARCODE_HEIGHT);

    doc
      .font("Helvetica")
      .fontSize(NAME_FONT_SIZE)
      .fillColor("black")
      .text(label.barcode as string, x, barcodeY + BARCODE_HEIGHT + barcodeGap, { width: cellWidth, align: "center" });

    col++;
    if (col >= COLS) {
      col = 0;
      y += cellHeight;
    }
  }

  doc.end();

  await new Promise<void>((resolve, reject) => {
    stream.on("finish", () => resolve());
    stream.on("error", reject);
  });

  console.log(`Generated ${labels.length} labels -> ${OUT_PATH}`);

  // Sube el PDF a R2 (mismo bucket público que las imágenes de producto) para
  // que el dueño lo pueda abrir e imprimir desde cualquier dispositivo, sin
  // depender de scp/acceso al VPS.
  const buffer = fs.readFileSync(OUT_PATH);
  const key = `blister-labels/blister-labels-${Date.now()}.pdf`;
  const url = await uploadToR2(buffer, key, "application/pdf");
  console.log(`Uploaded -> ${url}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});

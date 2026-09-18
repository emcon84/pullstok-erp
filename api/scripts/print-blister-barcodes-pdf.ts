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
const BARCODE_WIDTH = 45 * MM;
const BARCODE_HEIGHT = 15 * MM;
const COLS = 3;
const MARGIN = 30;
const CELL_PADDING = 10;

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
  const cellHeight = BARCODE_HEIGHT + 55;

  let col = 0;
  let y = MARGIN;

  for (const label of labels) {
    if (col === 0 && y + cellHeight > doc.page.height - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }

    const x = MARGIN + col * colWidth;

    doc
      .font("Helvetica-Bold")
      .fontSize(7)
      .fillColor("black")
      .text(label.name, x, y, { width: cellWidth, height: 22, ellipsis: true });

    const barcodeY = y + 24;
    drawBarcode(doc, label.barcode as string, x, barcodeY, BARCODE_WIDTH, BARCODE_HEIGHT);

    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("black")
      .text(label.barcode as string, x, barcodeY + BARCODE_HEIGHT + 3, { width: cellWidth, align: "center" });

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

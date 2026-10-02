// Genera el PDF de "Resumen de cuenta" que se manda por WhatsApp como
// comprobante (cuenta-corriente T1). A4, membrete (logo opcional + datos
// fiscales de Organization) + caja de saldo + tabla de movimientos con saldo
// acumulado, paginada con encabezado repetido y pie "Página X de Y".
//
// `compress: false` a propósito: es un documento chico (una tabla de texto),
// y dejar el content stream sin deflate permite testear el contenido con un
// simple buffer.toString() en vez de depender de la inflación de pdfkit en
// los tests (ver accountStatementPdf.test.ts).
import PDFDocument from "pdfkit";
import { round2 } from "../utils/money";

export interface AccountStatementOrganization {
  name: string;
  address?: string | null;
  phone?: string | null;
  taxId?: string | null;
  taxCondition?: string | null;
}

export interface AccountStatementMovement {
  id: string;
  type: "CHARGE" | "PAYMENT";
  amount: number;
  method?: string | null;
  note?: string | null;
  createdAt: Date | string;
  sale?: { id: string; saleDate: Date | string } | null;
}

export interface AccountStatementInput {
  customer: { name: string };
  organization: AccountStatementOrganization;
  logoUrl?: string | null;
  balance: number;
  movements: AccountStatementMovement[];
}

// Money / dates use es-AR like the invoices (PrintInvoice): "$ 1.234,50".
const MONEY = (n: number) =>
  `$ ${round2(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const DATE = (d: Date | string) =>
  new Date(d).toLocaleDateString("es-AR", { timeZone: "UTC" });

// Un CHARGE sin venta asociada es un cargo histórico (deuda anterior).
const movementLabel = (m: AccountStatementMovement): string => {
  if (m.type === "PAYMENT") return "Cobranza";
  return m.sale ? "Venta" : "Deuda anterior";
};

const METHOD_LABELS: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TARJETA_CREDITO: "Tarjeta de crédito",
  TARJETA_DEBITO: "Tarjeta de débito",
  TRANSFERENCIA: "Transferencia",
  QR: "QR",
  CUENTA_CORRIENTE: "Cuenta corriente",
};
const methodLabel = (method?: string | null): string =>
  method ? (METHOD_LABELS[method] ?? method) : "-";

const balanceLabel = (balance: number): string => {
  if (balance > 0) return "Saldo adeudado";
  if (balance < 0) return "Saldo a favor";
  return "Sin saldo";
};

// Visual identity of the invoices: Helvetica (Arial), black rules, #e6e6e6
// header band. Red/green only for amounts and the balance box.
const COLOR = {
  ink: "#000000",
  muted: "#555555",
  band: "#e6e6e6",
  zebra: "#f5f5f5",
  debt: "#b91c1c",
  debtBg: "#fdecec",
  credit: "#15803d",
  creditBg: "#e8f5ec",
};

/** Descarga el logo de `logoUrl` a Buffer. Nunca lanza: sin URL, fetch no-ok
 * o error de red → null (el PDF se genera igual, solo sin logo). */
const fetchLogo = async (logoUrl: string | null | undefined): Promise<Buffer | null> => {
  if (!logoUrl) return null;
  try {
    const res = await fetch(logoUrl);
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    console.error("[accountStatementPdf] no se pudo descargar el logo", err);
    return null;
  }
};

const MARGIN = 40;
const CONTENT_W = 515;
const FOOTER_Y = 842 - 30;
const PAGE_BOTTOM = 842 - 50; // rows must end above the footer
type Col = { x: number; width: number };
const COLS: Record<"fecha" | "tipo" | "metodo" | "nota" | "monto" | "saldo", Col> = {
  fecha: { x: 40, width: 58 },
  tipo: { x: 98, width: 72 },
  metodo: { x: 170, width: 72 },
  nota: { x: 242, width: 133 },
  monto: { x: 375, width: 85 },
  saldo: { x: 460, width: 95 },
};
const PAD = 4;

/** Arma el PDF A4 del resumen de cuenta y lo devuelve como Buffer. */
export const buildAccountStatementPdf = async (
  input: AccountStatementInput,
): Promise<Buffer> => {
  const logoBuffer = await fetchLogo(input.logoUrl);

  const doc = new PDFDocument({ size: "A4", margin: MARGIN, compress: false, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const { organization, customer, balance } = input;

  // Chronological (oldest first): the running balance reads top to bottom and
  // the last row equals the current balance. Stable for equal timestamps,
  // using the reverse of the input order (getAccount returns newest first).
  const ordered = input.movements
    .map((m, i) => ({ m, i }))
    .sort((a, b) => {
      const diff = new Date(a.m.createdAt).getTime() - new Date(b.m.createdAt).getTime();
      return diff !== 0 ? diff : b.i - a.i;
    })
    .map((x) => x.m);

  // --- Membrete (issuer left, document title right) ---------------------------
  let y = MARGIN;
  if (logoBuffer) {
    try {
      doc.image(logoBuffer, MARGIN, y, { fit: [80, 60] });
    } catch (err) {
      console.error("[accountStatementPdf] logo inválido, se omite", err);
    }
  }
  const headerX = logoBuffer ? 135 : MARGIN;
  doc.fillColor(COLOR.ink).font("Helvetica-Bold").fontSize(16).text(organization.name, headerX, y, { width: 280 });
  doc.font("Helvetica").fontSize(9);
  const fiscalLine = [organization.taxId ? `CUIT: ${organization.taxId}` : null, organization.taxCondition]
    .filter(Boolean)
    .join(" — ");
  if (fiscalLine) doc.text(fiscalLine, headerX, doc.y, { width: 280 });
  if (organization.address) doc.text(organization.address, headerX, doc.y, { width: 280 });
  if (organization.phone) doc.text(`Tel: ${organization.phone}`, headerX, doc.y, { width: 280 });
  const leftBottom = doc.y;

  doc.font("Helvetica-Bold").fontSize(14).text("RESUMEN DE CUENTA", 330, y, { width: 225, align: "right" });
  doc
    .font("Helvetica")
    .fontSize(9)
    .text(`Emitido el ${DATE(new Date())}`, 330, doc.y + 2, { width: 225, align: "right" });

  y = Math.max(leftBottom, y + 60) + 10;
  doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_W, y).lineWidth(1).strokeColor(COLOR.ink).stroke();

  // --- Cliente ----------------------------------------------------------------
  y += 10;
  doc.fillColor(COLOR.ink).font("Helvetica-Bold").fontSize(10).text("Cliente:", MARGIN, y, { continued: true });
  doc.font("Helvetica").text(` ${customer.name}`);

  // --- Balance box ------------------------------------------------------------
  y = doc.y + 10;
  const accent = balance > 0 ? COLOR.debt : balance < 0 ? COLOR.credit : COLOR.ink;
  const boxBg = balance > 0 ? COLOR.debtBg : balance < 0 ? COLOR.creditBg : COLOR.band;
  const boxH = 50;
  doc.lineWidth(1).rect(MARGIN, y, CONTENT_W, boxH).fillAndStroke(boxBg, accent);
  doc.fillColor(accent).font("Helvetica-Bold").fontSize(12).text(balanceLabel(balance), MARGIN + 14, y + 18, {
    width: 200,
    lineBreak: false,
  });
  if (balance !== 0) {
    doc.fontSize(22).text(MONEY(Math.abs(balance)), MARGIN + 220, y + 13, {
      width: CONTENT_W - 234,
      align: "right",
      lineBreak: false,
    });
  }

  // --- Tabla de movimientos -----------------------------------------------------
  const drawTableHeader = (top: number): number => {
    const h = 20;
    doc.lineWidth(1).rect(MARGIN, top, CONTENT_W, h).fillAndStroke(COLOR.band, COLOR.ink);
    doc.fillColor(COLOR.ink).font("Helvetica-Bold").fontSize(9);
    const cell = (label: string, c: Col, align: "left" | "right" = "left") =>
      doc.text(label, c.x + PAD, top + 6, { width: c.width - PAD * 2, align, lineBreak: false });
    cell("Fecha", COLS.fecha);
    cell("Tipo", COLS.tipo);
    cell("Método", COLS.metodo);
    cell("Nota", COLS.nota);
    cell("Monto", COLS.monto, "right");
    cell("Saldo acumulado", COLS.saldo, "right");
    return top + h;
  };

  let rowY = drawTableHeader(y + boxH + 16);
  let running = 0;

  ordered.forEach((m, idx) => {
    running = round2(running + (m.type === "CHARGE" ? m.amount : -m.amount));
    const note = m.note?.trim() || "-";
    const noteW = COLS.nota.width - PAD * 2;
    doc.font("Helvetica").fontSize(9);
    const rowH = Math.max(18, doc.heightOfString(note, { width: noteW }) + 8);

    if (rowY + rowH > PAGE_BOTTOM) {
      doc.addPage();
      rowY = drawTableHeader(MARGIN);
    }
    if (idx % 2 === 1) doc.rect(MARGIN, rowY, CONTENT_W, rowH).fill(COLOR.zebra);

    const ty = rowY + 5;
    const single = (txt: string, c: Col, color: string, align: "left" | "right" = "left", bold = false) =>
      doc
        .fillColor(color)
        .font(bold ? "Helvetica-Bold" : "Helvetica")
        .fontSize(9)
        .text(txt, c.x + PAD, ty, { width: c.width - PAD * 2, align, lineBreak: false, ellipsis: true });
    single(DATE(m.createdAt), COLS.fecha, COLOR.ink);
    single(movementLabel(m), COLS.tipo, COLOR.ink);
    single(methodLabel(m.method), COLS.metodo, COLOR.ink);
    doc.fillColor(COLOR.ink).font("Helvetica").fontSize(9).text(note, COLS.nota.x + PAD, ty, { width: noteW });
    single(MONEY(m.amount), COLS.monto, m.type === "CHARGE" ? COLOR.debt : COLOR.credit, "right", true);
    single(MONEY(running), COLS.saldo, running < 0 ? COLOR.credit : COLOR.ink, "right");

    doc
      .moveTo(MARGIN, rowY + rowH)
      .lineTo(MARGIN + CONTENT_W, rowY + rowH)
      .lineWidth(0.5)
      .strokeColor("#cccccc")
      .stroke();
    rowY += rowH;
  });

  if (ordered.length === 0) {
    doc.fillColor(COLOR.muted).font("Helvetica").fontSize(9).text("Sin movimientos", MARGIN + PAD, rowY + 6);
  }

  // --- Footer on every page: emission date + page X of Y -----------------------
  const range = doc.bufferedPageRange();
  const emitted = DATE(new Date());
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // Drop the bottom margin so footer text doesn't trigger an automatic new page.
    doc.page.margins.bottom = 0;
    doc
      .moveTo(MARGIN, FOOTER_Y - 6)
      .lineTo(MARGIN + CONTENT_W, FOOTER_Y - 6)
      .lineWidth(0.5)
      .strokeColor(COLOR.ink)
      .stroke();
    doc.fillColor(COLOR.muted).font("Helvetica").fontSize(8);
    doc.text(`Emitido el ${emitted}`, MARGIN, FOOTER_Y, { width: 250, lineBreak: false });
    doc.text(`Página ${i - range.start + 1} de ${range.count}`, MARGIN + 265, FOOTER_Y, {
      width: 250,
      align: "right",
      lineBreak: false,
    });
  }

  doc.end();
  return done;
};

export default buildAccountStatementPdf;

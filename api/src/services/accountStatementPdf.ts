// Genera el PDF de "Resumen de cuenta" que se manda por WhatsApp como
// comprobante (cuenta-corriente T1). A4, membrete (logo opcional + datos
// fiscales de Organization) + saldo + tabla de movimientos.
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

const MONEY = (n: number) => `$ ${round2(n).toFixed(2)}`;

const DATE = (d: Date | string) =>
  new Date(d).toLocaleDateString("es-AR", { timeZone: "UTC" });

const MOVEMENT_TYPE_LABEL: Record<AccountStatementMovement["type"], string> = {
  CHARGE: "Venta",
  PAYMENT: "Cobranza",
};

const balanceLabel = (balance: number): string => {
  if (balance > 0) return "Saldo adeudado";
  if (balance < 0) return "Saldo a favor";
  return "Sin saldo";
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

const COLS = {
  fecha: { x: 40, width: 75 },
  tipo: { x: 115, width: 65 },
  metodo: { x: 180, width: 95 },
  monto: { x: 275, width: 80 },
  nota: { x: 355, width: 197 },
};

/** Arma el PDF A4 del resumen de cuenta y lo devuelve como Buffer. */
export const buildAccountStatementPdf = async (
  input: AccountStatementInput,
): Promise<Buffer> => {
  const logoBuffer = await fetchLogo(input.logoUrl);

  const doc = new PDFDocument({ size: "A4", margin: 40, compress: false });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const { organization, customer, balance, movements } = input;

  // --- Membrete ---------------------------------------------------------
  let y = 40;
  if (logoBuffer) {
    try {
      doc.image(logoBuffer, 40, y, { fit: [80, 60] });
    } catch (err) {
      console.error("[accountStatementPdf] logo inválido, se omite", err);
    }
  }
  const headerX = logoBuffer ? 135 : 40;
  doc.font("Helvetica-Bold").fontSize(16).text(organization.name, headerX, y);
  doc.font("Helvetica").fontSize(9);
  const fiscalLine = [organization.taxId ? `CUIT: ${organization.taxId}` : null, organization.taxCondition]
    .filter(Boolean)
    .join(" — ");
  if (fiscalLine) doc.text(fiscalLine, headerX, doc.y);
  if (organization.address) doc.text(organization.address, headerX, doc.y);
  if (organization.phone) doc.text(`Tel: ${organization.phone}`, headerX, doc.y);

  y = Math.max(doc.y, y + 60) + 20;

  // --- Título + saldo -----------------------------------------------------
  doc.font("Helvetica-Bold").fontSize(13).text(`Resumen de cuenta — ${customer.name}`, 40, y);
  doc.font("Helvetica").fontSize(9).text(`Fecha de emisión: ${DATE(new Date())}`, 40, doc.y + 4);

  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .text(
      balance === 0 ? balanceLabel(balance) : `${balanceLabel(balance)}: ${MONEY(Math.abs(balance))}`,
      40,
      doc.y + 10,
    );

  // --- Tabla de movimientos ------------------------------------------------
  let rowY = doc.y + 20;
  doc.font("Helvetica-Bold").fontSize(9);
  doc.text("Fecha", COLS.fecha.x, rowY, { width: COLS.fecha.width });
  doc.text("Tipo", COLS.tipo.x, rowY, { width: COLS.tipo.width });
  doc.text("Método", COLS.metodo.x, rowY, { width: COLS.metodo.width });
  doc.text("Monto", COLS.monto.x, rowY, { width: COLS.monto.width });
  doc.text("Nota", COLS.nota.x, rowY, { width: COLS.nota.width });
  rowY += 14;
  doc.moveTo(40, rowY).lineTo(555, rowY).strokeColor("#999999").stroke();
  rowY += 6;

  doc.font("Helvetica").fontSize(9);
  for (const m of movements) {
    if (rowY > doc.page.height - 60) {
      doc.addPage();
      rowY = 40;
    }
    doc.text(DATE(m.createdAt), COLS.fecha.x, rowY, { width: COLS.fecha.width });
    doc.text(MOVEMENT_TYPE_LABEL[m.type], COLS.tipo.x, rowY, { width: COLS.tipo.width });
    doc.text(m.method ?? "-", COLS.metodo.x, rowY, { width: COLS.metodo.width });
    doc.text(round2(m.amount).toFixed(2), COLS.monto.x, rowY, { width: COLS.monto.width });
    doc.text(m.note ?? "-", COLS.nota.x, rowY, { width: COLS.nota.width });
    rowY += 16;
  }
  if (movements.length === 0) {
    doc.text("Sin movimientos", COLS.fecha.x, rowY);
  }

  doc.end();
  return done;
};

export default buildAccountStatementPdf;

import { round2 } from "@/lib/money";
import { PAYMENT_METHOD_LABELS, type PaymentInput } from "@/models/cashSessionModel";
import type { VendorCartItem } from "@/components/hooks/useVendorCart";
import { prepareTicketLogo } from "@/utils/ticketLogo";

/**
 * Ticket de venta NO fiscal para impresora térmica de 58 mm.
 *
 * Tres piezas, las dos primeras puras:
 *  - buildSaleTicket: carrito + pagos + descuento → modelo plano (snapshot).
 *  - renderSaleTicketHtml: modelo → documento HTML compacto (@page 58mm auto).
 *  - printSaleTicket: imprime ese HTML desde un iframe oculto, para que el
 *    @page A4 global de index.css no interfiera.
 */

/** Campos del renglón del carrito que el ticket necesita. */
export type SaleTicketItem = Pick<VendorCartItem, "name" | "price" | "quantity"> &
  Partial<
    Pick<
      VendorCartItem,
      "saleMode" | "priceKgSuelto" | "perUnitPrice" | "looseName" | "piecesPerBlister"
    >
  >;

export interface SaleTicketLine {
  label: string;
  detail: string;
  total: number;
}

export interface SaleTicketPayment {
  methodLabel: string;
  amount: number;
}

export interface SaleTicket {
  businessName: string;
  logoUrl?: string | null;
  /** true si `logoUrl` ya pasó por el pre-proceso de canvas (gris, sobre blanco). */
  logoProcessed?: boolean;
  /** Datos de la empresa para el encabezado (solo los que existen). */
  taxId?: string | null;
  taxCondition?: string | null;
  address?: string | null;
  phone?: string | null;
  /** Fecha/hora de emisión en ISO. */
  issuedAt: string;
  lines: SaleTicketLine[];
  subtotal: number;
  discountPct: number;
  discountAmount: number;
  total: number;
  payments: SaleTicketPayment[];
}

/** Encabezado de empresa del ticket (todo opcional; lo vacío no se imprime). */
export interface TicketCompany {
  businessName?: string | null;
  logoUrl?: string | null;
  taxId?: string | null;
  taxCondition?: string | null;
  address?: string | null;
  phone?: string | null;
}

export interface BuildSaleTicketInput extends TicketCompany {
  issuedAt: Date | string;
  items: SaleTicketItem[];
  payments?: PaymentInput[];
  discountPct?: number;
}

const DEFAULT_BUSINESS_NAME = "Pullstok";
/** Tope de la dirección (~2 líneas a 58 mm) para no alargar el encabezado. */
const MAX_ADDRESS_CHARS = 64;
/** Caracteres por línea a 58 mm con fuente monoespaciada de ~10,5 px. */
const MAX_LABEL_CHARS = 28;
/** Tiempo máximo de espera del logo antes de imprimir igual. */
const LOGO_TIMEOUT_MS = 3000;
/** Respaldo para quitar el iframe si nunca llega `afterprint`. */
const CLEANUP_TIMEOUT_MS = 60_000;

// ── Formato ──

const num = (n: number, min: number, max: number) =>
  n.toLocaleString("es-AR", { minimumFractionDigits: min, maximumFractionDigits: max });

/** Pesos es-AR sin decimales salvo que hagan falta ($8.000 / $1.226,67). */
export const money = (n: number) => {
  const v = round2(n);
  return `$${num(v, Number.isInteger(v) ? 0 : 2, 2)}`;
};

/** Cantidades (unidades o kg): hasta 3 decimales, mínimo `min`. */
export const qty = (n: number, min = 0) => num(n, min, 3);

const pad = (n: number) => String(n).padStart(2, "0");

export const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const truncate = (s: string, max: number) =>
  s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * Solo http(s), data:image/* o rutas relativas (resueltas contra el origen de
 * la app: el iframe es about:blank y una ruta relativa no cargaría).
 */
export function sanitizeLogoUrl(raw?: string | null): string | null {
  const v = raw?.trim();
  if (!v) return null;
  if (/^data:image\//i.test(v)) return v;
  try {
    const base = typeof window !== "undefined" ? window.location.origin : undefined;
    const url = new URL(v, base);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

export const clean = (v?: string | null) => v?.trim() || null;

/**
 * Arma los datos de empresa del encabezado: nombre/CUIT/condición de la
 * organización; dirección y teléfono de la SUCURSAL con respaldo en los de la
 * organización (por campo).
 */
export function resolveTicketCompany(src: {
  businessName?: string | null;
  logoUrl?: string | null;
  org?: { taxId?: string | null; taxCondition?: string | null; address?: string | null; phone?: string | null } | null;
  branch?: { address?: string | null; phone?: string | null } | null;
}): TicketCompany {
  return {
    businessName: src.businessName,
    logoUrl: src.logoUrl,
    taxId: clean(src.org?.taxId),
    taxCondition: clean(src.org?.taxCondition),
    address: clean(src.branch?.address) ?? clean(src.org?.address),
    phone: clean(src.branch?.phone) ?? clean(src.org?.phone),
  };
}

// ── Modelo ──

function buildLine(item: SaleTicketItem): SaleTicketLine {
  const mode = item.saleMode ?? "BOLSA_CERRADA";
  const isLoose = mode === "POR_PESO" || mode === "POR_MONTO";
  const label = isLoose ? item.looseName || item.name : item.name;
  // Precio unitario efectivo: en multipack por unidad el del renglón puede ser
  // el de caja; se usa perUnitPrice (mismo criterio que el payload de la venta).
  const unit = mode === "POR_UNIDAD" ? (item.perUnitPrice ?? item.price) : item.price;
  const total = round2(unit * item.quantity);

  let detail: string;
  if (mode === "POR_PESO") {
    detail = `${qty(item.quantity, 2)} kg x ${money(unit)}/kg`;
  } else if (mode === "POR_MONTO") {
    // La cantidad ES el monto en $; los kg salen del precio por kg de la celda.
    detail = item.priceKgSuelto
      ? `${money(total)} (${qty(round3(item.quantity / item.priceKgSuelto), 3)} kg)`
      : money(total);
  } else {
    detail = `${qty(item.quantity)} x ${money(unit)}`;
  }
  return { label, detail, total };
}

const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

export function buildSaleTicket(input: BuildSaleTicketInput): SaleTicket {
  const lines = input.items.map(buildLine);
  const subtotal = round2(lines.reduce((s, l) => s + l.total, 0));
  const discountPct = input.discountPct ?? 0;
  // Mismo cálculo que VendorOrderPanel: descuento a nivel venta.
  const discountAmount = round2((subtotal * discountPct) / 100);
  const total = round2(subtotal - discountAmount);
  const issuedAt =
    input.issuedAt instanceof Date ? input.issuedAt.toISOString() : input.issuedAt;

  return {
    businessName: input.businessName?.trim() || DEFAULT_BUSINESS_NAME,
    logoUrl: sanitizeLogoUrl(input.logoUrl),
    taxId: clean(input.taxId),
    taxCondition: clean(input.taxCondition),
    address: clean(input.address),
    phone: clean(input.phone),
    issuedAt,
    lines,
    subtotal,
    discountPct,
    discountAmount,
    total,
    payments: (input.payments ?? []).map((p) => ({
      methodLabel: PAYMENT_METHOD_LABELS[p.method] ?? p.method,
      amount: p.amount,
    })),
  };
}

// ── Render ──

const STYLES = `
@page { size: 58mm auto; margin: 0 }
* { box-sizing: border-box }
html, body { margin: 0; padding: 0; background: #fff; color: #000 }
/* Medido en papel real (OCOM 58 mm por driver de Windows): el ticket sale ~17%
   más ancho que en CSS y el borde derecho del papel corta el último carácter.
   Contenido de 38mm (40.5mm - 2.5mm de margen izquierdo) centrado en la zona
   imprimible; el margen derecho queda en 0 a propósito. */
body { width: 40.5mm; padding: 1.5mm 0 1.5mm 2.5mm; font: 10px/1.15 "Courier New", Courier, monospace }
header { text-align: center }
header img { display: block; margin: 0 auto 1mm; max-width: 34mm; max-height: 16mm; object-fit: contain }
header img.raw { filter: grayscale(1) contrast(1.2) }
.biz { font-weight: bold }
.info { font-size: 9.5px; overflow-wrap: anywhere }
.sep { border-top: 1px dashed #000; margin: 1mm 0 }
.item { margin: 0 }
.name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.row { display: flex; justify-content: space-between; gap: 1mm }
.row > span:first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.row > span:last-child { white-space: nowrap; text-align: right }
.total { font-weight: bold; font-size: 12px }
.pay { margin-top: 1mm }
footer { margin-top: 1.5mm; text-align: center; font-size: 9.5px }
`;

const row = (left: string, right: string, cls = "") =>
  `<div class="row${cls ? ` ${cls}` : ""}"><span>${escapeHtml(left)}</span><span>${escapeHtml(right)}</span></div>`;

export function renderSaleTicketHtml(ticket: SaleTicket): string {
  const logo = sanitizeLogoUrl(ticket.logoUrl);
  const items = ticket.lines
    .map(
      (l) =>
        `<div class="item"><div class="name">${escapeHtml(truncate(l.label, MAX_LABEL_CHARS))}</div>${row(l.detail, money(l.total))}</div>`,
    )
    .join("");

  const totals: string[] = [];
  if (ticket.discountAmount > 0) {
    totals.push(row("Subtotal", money(ticket.subtotal)));
    totals.push(row(`Descuento ${qty(ticket.discountPct)}%`, `-${money(ticket.discountAmount)}`));
  }
  totals.push(row("TOTAL", money(ticket.total), "total"));

  const payments = ticket.payments.length
    ? `<div class="pay">${ticket.payments.map((p) => row(p.methodLabel, money(p.amount))).join("")}</div>`
    : "";

  // Datos de la empresa: una línea por dato, solo los presentes.
  const info = [
    clean(ticket.taxId) && `CUIT: ${clean(ticket.taxId)}`,
    clean(ticket.taxCondition),
    clean(ticket.address) && truncate(clean(ticket.address)!, MAX_ADDRESS_CHARS),
    clean(ticket.phone) && `Tel: ${clean(ticket.phone)}`,
  ]
    .filter((l): l is string => !!l)
    .map((l) => `<div class="info">${escapeHtml(l)}</div>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="es-AR"><head><meta charset="utf-8"><title>Ticket</title><style>${STYLES}</style></head>
<body>
<header>${logo ? `<img${ticket.logoProcessed ? "" : ' class="raw"'} src="${escapeHtml(logo)}" alt="">` : ""}<div class="biz">${escapeHtml(ticket.businessName)}</div>${info}<div>${escapeHtml(formatDateTime(ticket.issuedAt))}</div></header>
<div class="sep"></div>
<section data-block="items">${items}</section>
<div class="sep"></div>
<section data-block="totals">${totals.join("")}</section>
${payments}
<footer><div>Gracias por su compra</div><div>Ticket no válido como factura</div></footer>
</body></html>`;
}

// ── Impresión ──

/**
 * Espera a que terminen de cargar las imágenes (logo) antes de imprimir. Un
 * logo lento o roto nunca bloquea: se quita y se imprime igual.
 */
function whenImagesReady(doc: Document, done: () => void) {
  const pending: HTMLImageElement[] = [];
  for (const img of Array.from(doc.images)) {
    if (!img.complete) pending.push(img);
    // Ya terminó pero falló (sin ancho natural): imagen rota, se quita.
    else if (img.naturalWidth === 0 && !/svg/i.test(img.src)) img.remove();
  }
  if (pending.length === 0) {
    done();
    return;
  }

  let left = pending.length;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    done();
  };
  const timer = setTimeout(() => {
    pending.forEach((img) => {
      if (!img.complete) img.remove();
    });
    finish();
  }, LOGO_TIMEOUT_MS);

  for (const img of pending) {
    img.addEventListener("load", () => {
      if (--left === 0) finish();
    });
    img.addEventListener("error", () => {
      img.remove();
      if (--left === 0) finish();
    });
  }
}

/**
 * Imprime el ticket con el diálogo del navegador (driver de Windows) desde un
 * iframe oculto con su propio documento y @page. Sin window (SSR/tests sin DOM)
 * no hace nada. La promesa resuelve cuando el iframe quedó armado (no cuando
 * termina la impresión). Sin logo no espera nada: el iframe se crea ya.
 */
export async function printSaleTicket(input: SaleTicket): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  let ticket = input;
  if (input.logoUrl) {
    try {
      // Logo claro → oscuro sobre blanco (nunca lanza; ante fallo vuelve la URL).
      const logoUrl = await prepareTicketLogo(input.logoUrl);
      ticket = { ...input, logoUrl, logoProcessed: logoUrl !== input.logoUrl };
    } catch {
      // Se imprime con la URL original y el filtro CSS de respaldo.
    }
  }

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.tabIndex = -1;
  iframe.title = "Ticket de venta";
  Object.assign(iframe.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "0",
    height: "0",
    border: "0",
    opacity: "0",
    pointerEvents: "none",
  });

  let cleaned = false;
  let started = false;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    timers.forEach(clearTimeout);
    iframe.remove();
  };

  document.body.appendChild(iframe);
  const win = iframe.contentWindow;
  const doc = iframe.contentDocument;
  if (!win || !doc) {
    cleanup();
    return;
  }

  const startPrint = () => {
    if (started || cleaned) return;
    started = true;
    whenImagesReady(doc, () => {
      if (cleaned) return;
      try {
        win.focus();
        win.print();
      } catch {
        cleanup();
      }
    });
  };

  doc.open();
  doc.write(renderSaleTicketHtml(ticket));
  doc.close();

  // Los listeners se registran DESPUÉS de document.open() (que los borra) y
  // del write: así el `load` del about:blank inicial no dispara la impresión
  // de un documento vacío.
  iframe.addEventListener("load", startPrint);
  win.addEventListener("afterprint", cleanup);
  // Respaldos: si el `load` se perdió, imprimir igual; y quitar el iframe si
  // nunca llega `afterprint`.
  timers.push(setTimeout(startPrint, 1000));
  timers.push(setTimeout(cleanup, CLEANUP_TIMEOUT_MS));
}

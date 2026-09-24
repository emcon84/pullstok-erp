import { clean, formatDateTime, money, qty, type SaleTicket } from "@/utils/saleTicket";

/**
 * Encoder ESC/POS del ticket de venta para impresoras térmicas de 58 mm
 * (p. ej. OCOM OCPP-M06). Puro: ticket → bytes; el envío vive en serialPrinter.
 *
 * Mismo layout compacto que el ticket HTML: 2 líneas por ítem (nombre + fila
 * `detalle ..... total`), sin renglones vacíos entre ítems.
 */

/** Columnas de papel de 58 mm con fuente A (12x24). */
const DEFAULT_COLUMNS = 32;
/** Ancho máx. del logo en puntos (58 mm = 384 puntos a 203 dpi). */
const MAX_RASTER_WIDTH = 384;
/** Alto máx. del logo: un raster enorme puede desbordar el buffer de la impresora. */
const MAX_RASTER_HEIGHT = 160;
/** Umbral de luminancia (0-255) bajo el cual un punto se imprime negro. */
const RASTER_THRESHOLD = 128;
/** Renglones de avance al final para que el ticket salga del cabezal. */
const FEED_LINES = 4;
/** Igual que el ticket HTML: la dirección no ocupa más de ~2 líneas. */
const MAX_ADDRESS_LINES = 2;

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

// ── Texto ──

/** Símbolos frecuentes que la descomposición Unicode no resuelve a ASCII. */
const SYMBOLS: Record<string, string> = {
  "¿": "?",
  "¡": "!",
  "€": "EUR",
  "–": "-",
  "—": "-",
  "‘": "'",
  "’": "'",
  "“": '"',
  "”": '"',
  "…": "...",
  "•": "*",
  "°": "o",
};

/**
 * Texto → ASCII imprimible. La mayoría de las térmicas baratas (clones ESC/POS)
 * NO comparten página de códigos, así que se TRANSLITERA en vez de mandar bytes
 * de una code page: á→a, ñ→n, ¿→?, €→EUR y todo lo que no tenga equivalente
 * ASCII imprimible sale como "?". Es el único punto de conversión: para soportar
 * una página de códigos (ESC t n) alcanza con cambiar esta función.
 */
export function toPrinterText(input: string): string {
  let out = "";
  for (const ch of input) {
    const mapped = SYMBOLS[ch];
    if (mapped !== undefined) {
      out += mapped;
      continue;
    }
    // NFKD separa la letra de su marca (ñ → n + ~) y resuelve ª, º, ², etc.
    const base = ch.normalize("NFKD").replace(/[̀-ͯ]/g, "");
    for (const c of base) {
      out += /^\s$/.test(c) ? " " : /^[\x20-\x7e]$/.test(c) ? c : "?";
    }
  }
  return out;
}

const cut = (s: string, max: number) => (s.length > max ? s.slice(0, max).trimEnd() : s);

/** `left` a la izquierda y `right` a la derecha en exactamente `cols` columnas. */
function row(left: string, right: string, cols: number): string {
  const r = cut(toPrinterText(right), cols);
  // Si no entra, se recorta el detalle: nunca se parte en otra línea.
  const l = cut(toPrinterText(left), Math.max(0, cols - r.length - 1));
  return l + " ".repeat(Math.max(0, cols - l.length - r.length)) + r;
}

/** Corte por palabras en a lo sumo `maxLines` líneas de `cols`; lo que sobra se descarta. */
function wrap(text: string, cols: number, maxLines: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of toPrinterText(text).split(/\s+/).filter(Boolean)) {
    let w = word;
    while (w.length > cols) {
      if (current) {
        lines.push(current);
        current = "";
      }
      lines.push(w.slice(0, cols));
      w = w.slice(cols);
    }
    if (!current) current = w;
    else if (current.length + 1 + w.length <= cols) current += ` ${w}`;
    else {
      lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, maxLines);
}

// ── Raster (logo) ──

/** Imagen 1 bit lista para `GS v 0`: `width` en puntos (múltiplo de 8), MSB primero. */
export interface EscPosRaster {
  width: number;
  height: number;
  data: Uint8Array;
}

interface RgbaBitmap {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

/**
 * RGBA → raster de 1 bit. Compone sobre blanco (transparente = blanco), umbral a
 * negro/blanco, ancho completado a múltiplo de 8 con blanco. Si excede
 * 384x160 puntos se reduce por vecino más cercano (el pipeline del logo ya
 * entrega el tamaño final: esto es solo una red de seguridad).
 */
export function rasterFromImageData(image: RgbaBitmap): EscPosRaster {
  const scale = Math.min(1, MAX_RASTER_WIDTH / image.width, MAX_RASTER_HEIGHT / image.height);
  const srcW = image.width;
  const w = Math.max(1, Math.floor(image.width * scale));
  const h = Math.max(1, Math.floor(image.height * scale));
  const bytesPerRow = Math.ceil(w / 8);
  const data = new Uint8Array(bytesPerRow * h);

  for (let y = 0; y < h; y++) {
    const sy = Math.min(image.height - 1, Math.floor(y / scale));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(srcW - 1, Math.floor(x / scale));
      const i = (sy * srcW + sx) * 4;
      const a = image.data[i + 3] / 255;
      const lum = 0.299 * image.data[i] + 0.587 * image.data[i + 1] + 0.114 * image.data[i + 2];
      const composed = a * lum + (1 - a) * 255;
      if (composed < RASTER_THRESHOLD) data[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return { width: bytesPerRow * 8, height: h, data };
}

// ── Bytes ──

class EscPosWriter {
  private bytes: number[] = [];

  raw(...b: number[]) {
    this.bytes.push(...b);
    return this;
  }
  init() {
    return this.raw(ESC, 0x40);
  }
  align(mode: "left" | "center") {
    return this.raw(ESC, 0x61, mode === "center" ? 1 : 0);
  }
  bold(on: boolean) {
    return this.raw(ESC, 0x45, on ? 1 : 0);
  }
  /** Una línea de texto (ya en ASCII) + salto de línea. */
  line(text: string) {
    for (let i = 0; i < text.length; i++) this.bytes.push(text.charCodeAt(i));
    return this.raw(LF);
  }
  feed(n: number) {
    return this.raw(ESC, 0x64, n);
  }
  /** Corte parcial (inocuo si no hay cortador). */
  cut() {
    return this.raw(GS, 0x56, 1);
  }
  /** GS v 0 m xL xH yL yH d...: imagen raster en modo normal. */
  raster({ width, height, data }: EscPosRaster) {
    const xBytes = width >> 3;
    this.raw(GS, 0x76, 0x30, 0x00, xBytes & 0xff, xBytes >> 8, height & 0xff, height >> 8);
    for (let i = 0; i < data.length; i++) this.bytes.push(data[i]);
    return this;
  }
  done() {
    return Uint8Array.from(this.bytes);
  }
}

export interface EncodeOptions {
  /** Columnas del papel (32 = 58 mm, fuente A). */
  columns?: number;
  /** Logo ya rasterizado (opcional). */
  logo?: EscPosRaster | null;
  /** Cortar al final (`GS V 1`). Las portátiles no suelen tener cortador. */
  cut?: boolean;
}

export function encodeSaleTicketEscPos(ticket: SaleTicket, opts: EncodeOptions = {}): Uint8Array {
  const cols = opts.columns ?? DEFAULT_COLUMNS;
  const w = new EscPosWriter().init();
  const sep = "-".repeat(cols);

  // Encabezado centrado.
  w.align("center");
  if (opts.logo) w.raster(opts.logo);
  w.bold(true).line(cut(toPrinterText(ticket.businessName), cols)).bold(false);
  const taxId = clean(ticket.taxId);
  const phone = clean(ticket.phone);
  const info = [
    taxId && `CUIT: ${taxId}`,
    clean(ticket.taxCondition),
    ...(clean(ticket.address) ? wrap(clean(ticket.address)!, cols, MAX_ADDRESS_LINES) : []),
    phone && `Tel: ${phone}`,
  ].filter((l): l is string => !!l);
  for (const l of info) w.line(cut(toPrinterText(l), cols));
  const when = formatDateTime(ticket.issuedAt);
  if (when) w.line(when);

  // Ítems: nombre + fila detalle/total, sin separadores entre ítems.
  w.align("left").line(sep);
  for (const l of ticket.lines) {
    w.line(cut(toPrinterText(l.label), cols));
    w.line(row(l.detail, money(l.total), cols));
  }
  w.line(sep);

  // Totales.
  if (ticket.discountAmount > 0) {
    w.line(row("Subtotal", money(ticket.subtotal), cols));
    w.line(row(`Descuento ${qty(ticket.discountPct)}%`, `-${money(ticket.discountAmount)}`, cols));
  }
  w.bold(true).line(row("TOTAL", money(ticket.total), cols)).bold(false);

  // Medios de pago, uno por fila.
  for (const p of ticket.payments) w.line(row(p.methodLabel, money(p.amount), cols));

  // Pie.
  w.align("center").line("Gracias por su compra").line("Ticket no valido como factura");
  w.align("left").feed(FEED_LINES);
  if (opts.cut) w.cut();
  return w.done();
}

/** Ticket de prueba al conectar la impresora: que el usuario vea salir papel. */
export function encodeTestTicketEscPos(): Uint8Array {
  return new EscPosWriter()
    .init()
    .align("center")
    .bold(true)
    .line("Impresora conectada - Pullstok")
    .bold(false)
    .align("left")
    .feed(FEED_LINES)
    .done();
}

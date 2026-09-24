import { describe, it, expect } from "vitest";
import {
  encodeSaleTicketEscPos,
  encodeTestTicketEscPos,
  rasterFromImageData,
  toPrinterText,
  type EscPosRaster,
} from "@/utils/escpos";
import { buildSaleTicket, type SaleTicketItem } from "@/utils/saleTicket";

// Encoder ESC/POS del ticket: puro, bytes → impresora térmica de 58 mm
// (32 columnas, fuente A). Se testea decodificando los bytes de vuelta.

const ESC = 0x1b;
const GS = 0x1d;

const item = (over: Partial<SaleTicketItem> = {}): SaleTicketItem => ({
  name: "Royal Canin 15kg",
  price: 8000,
  quantity: 2,
  ...over,
});

const ticket = (items: SaleTicketItem[] = [item()], over = {}) =>
  buildSaleTicket({
    issuedAt: "2026-09-24T15:30:00",
    businessName: "Mi Pet Shop",
    items,
    payments: [{ method: "EFECTIVO", amount: 16000 }],
    ...over,
  });

/** Bytes → texto por línea, sin comandos ESC/GS (solo válido sin logo raster). */
function textLines(bytes: Uint8Array): string[] {
  const raw = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  return raw
    .replace(/\x1b[@]/g, "")
    .replace(/\x1b[aEd]./gs, "")
    .replace(/\x1dV./gs, "")
    .split("\n");
}

/** Índice de la primera aparición de `seq` en `bytes` (o -1). */
function indexOfSeq(bytes: Uint8Array, seq: number[], from = 0): number {
  outer: for (let i = from; i <= bytes.length - seq.length; i++) {
    for (let j = 0; j < seq.length; j++) if (bytes[i + j] !== seq[j]) continue outer;
    return i;
  }
  return -1;
}

const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

describe("toPrinterText", () => {
  it("quita diacríticos y traduce signos de apertura", () => {
    expect(toPrinterText("Ñandú ¿Qué? ¡Hola! áéíóú")).toBe("Nandu ?Que? !Hola! aeiou");
  });

  it("traduce símbolos comunes y reemplaza lo demás por '?'", () => {
    expect(toPrinterText("10 € – ok…")).toBe("10 EUR - ok...");
    expect(toPrinterText("日本語 🐶")).toBe("??? ?");
  });

  it("nunca deja caracteres fuera de ASCII imprimible", () => {
    const out = toPrinterText("Tab\tsalto\nañ€°ºª“”‘’");
    expect(/^[\x20-\x7e]*$/.test(out)).toBe(true);
  });
});

describe("encodeSaleTicketEscPos", () => {
  it("empieza con ESC @ (init)", () => {
    const bytes = encodeSaleTicketEscPos(ticket());
    expect([bytes[0], bytes[1]]).toEqual([ESC, 0x40]);
  });

  it("el texto sale transliterado a ASCII (sin bytes > 0x7f)", () => {
    const t = ticket([item({ name: "Ñandú ¡Cachorro! Pañales €" })], {
      businessName: "Peluquería Ñu",
      address: "Av. Córdoba 123",
    });
    const bytes = encodeSaleTicketEscPos(t);
    expect(Array.from(bytes).every((b) => b <= 0x7f)).toBe(true);
    const text = textLines(bytes).join("\n");
    expect(text).toContain("Peluqueria Nu");
    expect(text).toContain("Nandu !Cachorro! Panales EUR");
    expect(text).toContain("Av. Cordoba 123");
  });

  it("cada línea entra en las columnas (32 por defecto)", () => {
    const t = ticket([
      item({ name: "Un nombre de producto extremadamente largo que no entra en 32 columnas" }),
    ]);
    for (const line of textLines(encodeSaleTicketEscPos(t))) {
      expect(line.length).toBeLessThanOrEqual(32);
    }
  });

  it("respeta la opción columns", () => {
    const t = ticket([item({ name: "Alimento balanceado para perros adultos" })]);
    for (const line of textLines(encodeSaleTicketEscPos(t, { columns: 42 }))) {
      expect(line.length).toBeLessThanOrEqual(42);
    }
    const line = textLines(encodeSaleTicketEscPos(t, { columns: 42 })).find((l) => /^-+$/.test(l));
    expect(line).toHaveLength(42);
  });

  it("cada ítem ocupa como máximo 2 líneas: nombre + detalle...total alineado", () => {
    const t = ticket([item({ name: "Royal Canin 15kg" })]);
    const lines = textLines(encodeSaleTicketEscPos(t));
    const i = lines.indexOf("Royal Canin 15kg");
    expect(i).toBeGreaterThan(-1);
    const detailRow = lines[i + 1];
    expect(detailRow.length).toBe(32);
    expect(detailRow.startsWith("2 x $8.000")).toBe(true);
    expect(detailRow.endsWith("$16.000")).toBe(true);
  });

  it("detalle demasiado largo se trunca (nunca agrega líneas)", () => {
    const t = ticket([
      item({
        name: "Granel",
        saleMode: "POR_PESO",
        quantity: 12.5,
        price: 100000,
      }),
    ]);
    // Detalle "12,50 kg x $100.000/kg" no entra junto al total en 20 columnas.
    const lines = textLines(encodeSaleTicketEscPos(t, { columns: 20 }));
    const i = lines.indexOf("Granel");
    expect(lines[i + 1]).toHaveLength(20);
    expect(lines[i + 1].startsWith("12,50")).toBe(true);
    expect(lines[i + 1].endsWith(" $1.250.000")).toBe(true);
    expect(lines[i + 2]).toMatch(/^-+$/);
  });

  it("40 ítems: sin renglones vacíos entre ítems y 2 líneas por ítem", () => {
    const items = Array.from({ length: 40 }, (_, i) =>
      item({ name: `Producto ${i + 1} con nombre largo de prueba`, quantity: i + 1 }),
    );
    const lines = textLines(encodeSaleTicketEscPos(ticket(items)));
    const seps = lines.reduce<number[]>((acc, l, idx) => (/^-{32}$/.test(l) ? [...acc, idx] : acc), []);
    expect(seps.length).toBeGreaterThanOrEqual(2);
    const block = lines.slice(seps[0] + 1, seps[1]);
    expect(block).toHaveLength(80);
    expect(block.every((l) => l.trim().length > 0)).toBe(true);
  });

  it("descuento: filas Subtotal/Descuento solo si es > 0", () => {
    const sin = textLines(encodeSaleTicketEscPos(ticket())).join("\n");
    expect(sin).not.toContain("Subtotal");
    expect(sin).not.toContain("Descuento");

    const con = textLines(encodeSaleTicketEscPos(ticket([item()], { discountPct: 10 }))).join("\n");
    expect(con).toContain("Subtotal");
    expect(con).toMatch(/Descuento 10%\s+-\$1\.600/);
    expect(con).toMatch(/TOTAL\s+\$14\.400/);
  });

  it("TOTAL va dentro de negrita: ESC E 1 ... ESC E 0", () => {
    const bytes = encodeSaleTicketEscPos(ticket());
    const on = indexOfSeq(bytes, [ESC, 0x45, 0x01, ...ascii("TOTAL")]);
    expect(on).toBeGreaterThan(-1);
    const off = indexOfSeq(bytes, [ESC, 0x45, 0x00], on);
    expect(off).toBeGreaterThan(on);
    // Nada de la fila de pagos queda dentro de la negrita.
    const between = Array.from(bytes.slice(on, off), (b) => String.fromCharCode(b)).join("");
    expect(between).not.toContain("Efectivo");
  });

  it("encabezado: CUIT/condición/dirección/Tel solo si existen", () => {
    const vacio = textLines(encodeSaleTicketEscPos(ticket())).join("\n");
    expect(vacio).not.toContain("CUIT");
    expect(vacio).not.toContain("Tel:");

    const lleno = textLines(
      encodeSaleTicketEscPos(
        ticket([item()], {
          taxId: "30-12345678-9",
          taxCondition: "IVA Responsable Inscripto",
          address: "Calle Falsa 123",
          phone: "11-5555-0000",
        }),
      ),
    ).join("\n");
    expect(lleno).toContain("CUIT: 30-12345678-9");
    expect(lleno).toContain("IVA Responsable Inscripto");
    expect(lleno).toContain("Calle Falsa 123");
    expect(lleno).toContain("Tel: 11-5555-0000");
  });

  it("fecha es-AR, pagos una por fila y pie de ticket", () => {
    const t = ticket([item()], {
      payments: [
        { method: "EFECTIVO", amount: 10000 },
        { method: "TARJETA_DEBITO", amount: 6000 },
      ],
    });
    const text = textLines(encodeSaleTicketEscPos(t)).join("\n");
    expect(text).toContain("24/09/2026 15:30");
    expect(text).toMatch(/Efectivo\s+\$10\.000/);
    expect(text).toMatch(/\$6\.000/);
    expect(text).toContain("Gracias por su compra");
    expect(text).toContain("Ticket no valido como factura");
  });

  it("termina con avance de papel (ESC d n, n >= 3)", () => {
    const bytes = encodeSaleTicketEscPos(ticket());
    const n = bytes.length;
    expect(bytes[n - 3]).toBe(ESC);
    expect(bytes[n - 2]).toBe(0x64);
    expect(bytes[n - 1]).toBeGreaterThanOrEqual(3);
  });

  it("logo raster: GS v 0 con el ancho/alto en bytes little-endian", () => {
    const logo: EscPosRaster = { width: 16, height: 3, data: new Uint8Array([1, 2, 3, 4, 5, 6]) };
    const bytes = encodeSaleTicketEscPos(ticket(), { logo });
    const at = indexOfSeq(bytes, [GS, 0x76, 0x30, 0x00]);
    expect(at).toBeGreaterThan(-1);
    // xL xH = 2 bytes por fila, yL yH = 3 filas.
    expect(Array.from(bytes.slice(at + 4, at + 8))).toEqual([2, 0, 3, 0]);
    expect(Array.from(bytes.slice(at + 8, at + 14))).toEqual([1, 2, 3, 4, 5, 6]);
    // El logo va centrado, antes del nombre del negocio.
    expect(at).toBeGreaterThan(indexOfSeq(bytes, [ESC, 0x61, 0x01]));
    expect(at).toBeLessThan(indexOfSeq(bytes, ascii("Mi Pet Shop")));
  });

  it("sin logo no emite GS v 0", () => {
    expect(indexOfSeq(encodeSaleTicketEscPos(ticket()), [GS, 0x76, 0x30])).toBe(-1);
    expect(indexOfSeq(encodeSaleTicketEscPos(ticket(), { logo: null }), [GS, 0x76, 0x30])).toBe(-1);
  });
});

describe("rasterFromImageData", () => {
  // Patrón 8x2: fila 0 = negro/blanco alternado, fila 1 = al revés.
  const px = (v: number): number[] => [v, v, v, 255];
  const bitmap = (rows: number[][]) => ({
    width: rows[0].length,
    height: rows.length,
    data: new Uint8ClampedArray(rows.flatMap((r) => r.flatMap(px))),
  });

  it("umbral a 1 bit, MSB primero: negro = 1", () => {
    const r = rasterFromImageData(
      bitmap([
        [0, 255, 0, 255, 0, 255, 0, 255],
        [255, 0, 255, 0, 255, 0, 255, 0],
      ]),
    );
    expect(r.width).toBe(8);
    expect(r.height).toBe(2);
    expect(Array.from(r.data)).toEqual([0b10101010, 0b01010101]);
  });

  it("completa el ancho a múltiplo de 8 con blanco (0)", () => {
    const r = rasterFromImageData(bitmap([[0, 0, 0, 0, 0]]));
    expect(r.width).toBe(8);
    expect(Array.from(r.data)).toEqual([0b11111000]);
  });

  it("limita el ancho a 384 puntos", () => {
    const wide = { width: 800, height: 4, data: new Uint8ClampedArray(800 * 4 * 4).fill(0) };
    const r = rasterFromImageData(wide);
    expect(r.width).toBeLessThanOrEqual(384);
    expect(r.width % 8).toBe(0);
    expect(r.data.length).toBe((r.width / 8) * r.height);
  });

  it("transparente cuenta como blanco", () => {
    const r = rasterFromImageData({
      width: 8,
      height: 1,
      data: new Uint8ClampedArray(8 * 4), // todo RGBA 0
    });
    expect(Array.from(r.data)).toEqual([0]);
  });
});

describe("encodeTestTicketEscPos", () => {
  it("es un ticket de prueba corto con init y avance", () => {
    const bytes = encodeTestTicketEscPos();
    expect([bytes[0], bytes[1]]).toEqual([ESC, 0x40]);
    const text = textLines(bytes).join("\n");
    expect(text).toContain("Impresora conectada");
    expect(text).toContain("Pullstok");
    expect(bytes[bytes.length - 3]).toBe(ESC);
    expect(bytes[bytes.length - 2]).toBe(0x64);
    expect(Array.from(bytes).every((b) => b <= 0x7f)).toBe(true);
  });
});

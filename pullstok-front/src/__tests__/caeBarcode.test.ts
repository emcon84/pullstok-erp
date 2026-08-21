import { describe, it, expect, vi, afterEach } from "vitest";
import jsPDF from "jspdf";
import { code128BSymbols, drawCaeBarcode } from "../utils/caeBarcode";

const spies: Array<ReturnType<typeof vi.spyOn>> = [];

afterEach(() => {
  spies.forEach((spy) => spy.mockRestore());
  spies.length = 0;
});

/** Captura las llamadas a doc.rect con tipado que sobrevive a tsc -b strict. */
const rectCalls = (doc: jsPDF): Array<[number, number, number, number]> => {
  const calls: Array<[number, number, number, number]> = [];
  const original = doc.rect.bind(doc);
  (doc as unknown as { rect: (...a: unknown[]) => void }).rect = (
    ...args: unknown[]
  ) => {
    calls.push(args as [number, number, number, number]);
    return original(...(args as [number, number, number, number]));
  };
  return calls;
};

describe("code128BSymbols", () => {
  it("codifica Code128B con checksum correcto", () => {
    // "123" → startB(104), '1'(49-32=17), '2'(18), '3'(19).
    // checksum = (104 + 17*1 + 18*2 + 19*3) % 103 = 214 % 103 = 8.
    expect(code128BSymbols("123")).toEqual([104, 17, 18, 19, 8, 106]);
  });

  it("acepta un CAE de 14 dígitos", () => {
    const symbols = code128BSymbols("71907643210631");
    expect(symbols[0]).toBe(104);
    expect(symbols[symbols.length - 1]).toBe(106);
    // start + 14 dígitos + checksum + stop = 17 símbolos
    expect(symbols.length).toBe(17);
  });

  it("lanza con valor vacío", () => {
    expect(() => code128BSymbols("")).toThrow();
  });

  it("lanza con caracteres fuera de ASCII imprimible", () => {
    expect(() => code128BSymbols("123ñ")).toThrow();
  });
});

describe("drawCaeBarcode", () => {
  it("dibuja barras que ocupan exactamente el ancho pedido", () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const calls = rectCalls(doc);

    const width = 68;
    drawCaeBarcode(doc, "123", 10, 50, width);

    // 5 símbolos de 11 módulos (start+3 datos+checksum) + stop de 13 módulos.
    // Barras por símbolo: los 6 dígitos de patrón tienen 3 barras; el stop
    // "2331112" tiene 4 barras → 5*3 + 4 = 19 rect().
    expect(calls.length).toBe(19);

    const xs = calls.map((c) => c[0]);
    const ws = calls.map((c) => c[2]);
    const ys = calls.map((c) => c[1]);

    // Ninguna barra sale del ancho pedido [10, 10+68].
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(10);
    const maxX = Math.max(...xs.map((x, i) => x + ws[i]));
    expect(maxX).toBeCloseTo(10 + width, 6);

    // Altura uniforme y un solo color de relleno (barras negras).
    expect(new Set(ys).size).toBe(1);
  });

  it("lanza si el CAE no es encodable", () => {
    const doc = new jsPDF();
    expect(() => drawCaeBarcode(doc, "", 10, 50, 100)).toThrow();
  });
});
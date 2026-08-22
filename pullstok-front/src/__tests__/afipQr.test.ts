import { describe, it, expect, afterEach, vi } from "vitest";
import jsPDF from "jspdf";
import { buildAfipQrUrl, drawAfipQr, getQrMatrix, type AfipQrPayload } from "../utils/afipQr";

const spies: Array<ReturnType<typeof vi.spyOn>> = [];

afterEach(() => {
  spies.forEach((spy) => spy.mockRestore());
  spies.length = 0;
});

/** Captura las llamadas a doc.rect con tipado que sobrevive a tsc -b strict
 * (mismo patrón que caeBarcode.test.ts: reasignar el método en vez de
 * vi.spyOn, que rompe con la sobrecarga de firmas de jsPDF.rect). */
const rectCalls = (doc: jsPDF): Array<[number, number, number, number, string?]> => {
  const calls: Array<[number, number, number, number, string?]> = [];
  const original = doc.rect.bind(doc);
  (doc as unknown as { rect: (...a: unknown[]) => void }).rect = (
    ...args: unknown[]
  ) => {
    calls.push(args as [number, number, number, number, string?]);
    return original(...(args as [number, number, number, number]));
  };
  return calls;
};

const validPayload: AfipQrPayload = {
  fecha: "2026-08-21",
  cuit: 30709706701,
  ptoVta: 2,
  tipoCmp: 6,
  nroCmp: 1,
  importe: 211907.92,
  tipoDocRec: 80,
  nroDocRec: 20201731594,
  codAut: 86340779640924,
};

describe("buildAfipQrUrl", () => {
  it("codifica el JSON del payload en la URL de verificación de AFIP", () => {
    const url = buildAfipQrUrl(validPayload);

    expect(url.startsWith("https://www.afip.gob.ar/fe/qr/?p=")).toBe(true);

    const base64 = url.replace("https://www.afip.gob.ar/fe/qr/?p=", "");
    const decoded = JSON.parse(Buffer.from(base64, "base64").toString("utf-8"));

    expect(decoded).toEqual({
      ver: 1,
      fecha: "2026-08-21",
      cuit: 30709706701,
      ptoVta: 2,
      tipoCmp: 6,
      nroCmp: 1,
      importe: 211907.92,
      moneda: "PES",
      ctz: 1,
      tipoDocRec: 80,
      nroDocRec: 20201731594,
      tipoCodAut: "E",
      codAut: 86340779640924,
    });
  });

  it("aplica defaults de moneda/ctz/tipoCodAut/receptor cuando faltan", () => {
    const { tipoDocRec, nroDocRec, ...rest } = validPayload;
    void tipoDocRec;
    void nroDocRec;
    const url = buildAfipQrUrl(rest);
    const base64 = url.replace("https://www.afip.gob.ar/fe/qr/?p=", "");
    const decoded = JSON.parse(Buffer.from(base64, "base64").toString("utf-8"));

    expect(decoded.moneda).toBe("PES");
    expect(decoded.ctz).toBe(1);
    expect(decoded.tipoCodAut).toBe("E");
    // Sin datos de receptor: consumidor final sin identificar (99/0).
    expect(decoded.tipoDocRec).toBe(99);
    expect(decoded.nroDocRec).toBe(0);
  });

  it.each([
    ["fecha", { ...validPayload, fecha: "21/08/2026" }],
    ["cuit", { ...validPayload, cuit: NaN }],
    ["ptoVta", { ...validPayload, ptoVta: NaN }],
    ["tipoCmp", { ...validPayload, tipoCmp: NaN }],
    ["nroCmp", { ...validPayload, nroCmp: NaN }],
    ["importe", { ...validPayload, importe: NaN }],
    ["codAut", { ...validPayload, codAut: NaN }],
  ])("lanza si falta/es inválido %s", (_field, payload) => {
    expect(() => buildAfipQrUrl(payload as AfipQrPayload)).toThrow();
  });
});

describe("drawAfipQr", () => {
  it("dibuja módulos que ocupan exactamente el área size x size pedida", () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const calls = rectCalls(doc);

    const x = 20;
    const y = 30;
    const size = 70;
    drawAfipQr(doc, validPayload, x, y, size);

    expect(calls.length).toBeGreaterThan(0);

    const xs = calls.map((c) => c[0]);
    const ys = calls.map((c) => c[1]);
    const rightEdges = calls.map((c) => c[0] + c[2]);
    const bottomEdges = calls.map((c) => c[1] + c[3]);

    expect(Math.min(...xs)).toBeGreaterThanOrEqual(x);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(y);
    expect(Math.max(...rightEdges)).toBeLessThanOrEqual(x + size + 1e-6);
    expect(Math.max(...bottomEdges)).toBeLessThanOrEqual(y + size + 1e-6);

    // Todos los rects se dibujan con relleno ("F"), como el barcode.
    expect(calls.every((c) => c[4] === "F")).toBe(true);
  });

  it("lanza si el payload es inválido (no dibuja nada)", () => {
    const doc = new jsPDF();
    const calls = rectCalls(doc);

    expect(() =>
      drawAfipQr(doc, { ...validPayload, codAut: NaN }, 10, 10, 50),
    ).toThrow();
    expect(calls.length).toBe(0);
  });
});

describe("getQrMatrix (deuda técnica item 4 — unificación de motores)", () => {
  it("devuelve la misma matriz que usan ambos motores (moduleCount + isDark)", () => {
    const { moduleCount, isDark } = getQrMatrix(validPayload);

    expect(moduleCount).toBeGreaterThan(0);
    // El verificador de la esquina superior-izquierda siempre es oscuro
    // (finder pattern). Comprobamos que el predicado funciona y es estable.
    expect(typeof isDark).toBe("function");
    expect(isDark(0, 0)).toBe(true);
  });

  it("lanza si el payload es inválido (mismo criterio que drawAfipQr)", () => {
    expect(() => getQrMatrix({ ...validPayload, cuit: NaN })).toThrow();
  });
});

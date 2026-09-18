import {
  formatInternalBarcode,
  parseInternalBarcodeSeq,
  nextInternalBarcodeSeq,
} from "../internalBarcode";

describe("formatInternalBarcode", () => {
  it("formatea con padding de 5 dígitos", () => {
    expect(formatInternalBarcode("BLST", 1)).toBe("BLST00001");
    expect(formatInternalBarcode("BLST", 42)).toBe("BLST00042");
    expect(formatInternalBarcode("BLST", 12345)).toBe("BLST12345");
  });

  it("un prefix distinto cambia el resultado, no solo relabela un caso fijo", () => {
    expect(formatInternalBarcode("INT", 1)).toBe("INT00001");
    expect(formatInternalBarcode("INT", 42)).toBe("INT00042");
  });
});

describe("parseInternalBarcodeSeq", () => {
  it("hace round-trip con formatInternalBarcode", () => {
    expect(parseInternalBarcodeSeq("BLST", formatInternalBarcode("BLST", 7))).toBe(7);
    expect(parseInternalBarcodeSeq("BLST", formatInternalBarcode("BLST", 99999))).toBe(99999);
    expect(parseInternalBarcodeSeq("INT", formatInternalBarcode("INT", 7))).toBe(7);
  });

  it("devuelve null para un string que no matchea el formato", () => {
    expect(parseInternalBarcodeSeq("BLST", "")).toBeNull();
    expect(parseInternalBarcodeSeq("BLST", "BLST1")).toBeNull();
    expect(parseInternalBarcodeSeq("BLST", "BLST123456")).toBeNull();
    expect(parseInternalBarcodeSeq("BLST", "2000030001808")).toBeNull();
    expect(parseInternalBarcodeSeq("BLST", "ABC12345")).toBeNull();
  });

  it("un prefix no matchea el barcode de otro prefix", () => {
    expect(parseInternalBarcodeSeq("INT", "BLST00001")).toBeNull();
    expect(parseInternalBarcodeSeq("BLST", "INT00001")).toBeNull();
  });
});

describe("nextInternalBarcodeSeq", () => {
  it("empieza en 1 con lista vacía", () => {
    expect(nextInternalBarcodeSeq("BLST", [])).toBe(1);
  });

  it("continúa desde el máximo entre valores mezclados (nulls, barcodes ajenos, BLST existentes)", () => {
    const existing = [
      null,
      "2000030001808",
      "BLST00003",
      null,
      "BLST00010",
      "ABC123",
      "BLST00007",
    ];
    expect(nextInternalBarcodeSeq("BLST", existing)).toBe(11);
  });

  it("devuelve 1 si hay barcodes pero ninguno matchea el prefix pedido", () => {
    expect(nextInternalBarcodeSeq("BLST", ["2000030001808", null, "ABC123"])).toBe(1);
  });

  it("ignora barcodes de OTRO prefix al calcular la secuencia (BLST y INT no colisionan)", () => {
    const existing = ["BLST00010", "INT00003", null];
    expect(nextInternalBarcodeSeq("INT", existing)).toBe(4);
    expect(nextInternalBarcodeSeq("BLST", existing)).toBe(11);
  });
});

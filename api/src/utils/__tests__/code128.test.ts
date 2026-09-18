import { code128BSymbols } from "../code128";

describe("code128BSymbols", () => {
  it("codifica Code128B con checksum correcto", () => {
    // "123" → startB(104), '1'(49-32=17), '2'(18), '3'(19).
    // checksum = (104 + 17*1 + 18*2 + 19*3) % 103 = 214 % 103 = 8.
    expect(code128BSymbols("123")).toEqual([104, 17, 18, 19, 8, 106]);
  });

  it("acepta un código alfanumérico de etiqueta (BLST00001)", () => {
    const symbols = code128BSymbols("BLST00001");
    expect(symbols[0]).toBe(104);
    expect(symbols[symbols.length - 1]).toBe(106);
    // start + 9 caracteres + checksum + stop = 12 símbolos
    expect(symbols.length).toBe(12);
  });

  it("lanza con valor vacío", () => {
    expect(() => code128BSymbols("")).toThrow();
  });

  it("lanza con caracteres fuera de ASCII imprimible", () => {
    expect(() => code128BSymbols("BLSTñ")).toThrow();
  });
});

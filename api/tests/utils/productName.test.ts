import { normalizeProductName } from "../../src/utils/productName";

describe("normalizeProductName — nombre persistido: MAYÚSCULAS + espacios colapsados + trim", () => {
  it("pone en mayúsculas el nombre", () => {
    expect(normalizeProductName("Sieger Puppy")).toBe("SIEGER PUPPY");
  });

  it("colapsa múltiples espacios y tabs a uno", () => {
    expect(normalizeProductName("SIEGER   Puppy   Mini")).toBe("SIEGER PUPPY MINI");
    expect(normalizeProductName("SIEGER\tPuppy\t\tMini")).toBe("SIEGER PUPPY MINI");
  });

  it("hace trim de espacios al inicio y final", () => {
    expect(normalizeProductName("  SIEGER PUPPY  ")).toBe("SIEGER PUPPY");
  });

  it("caso real de planilla: 'Sieger Puppy Medium & Large Breed x 3 Kg.'", () => {
    expect(normalizeProductName("Sieger Puppy Medium & Large Breed x 3 Kg.")).toBe(
      "SIEGER PUPPY MEDIUM & LARGE BREED X 3 KG.",
    );
  });

  it("mantiene signos, guiones, unidades y el separador x", () => {
    expect(normalizeProductName("RUMINAL 88 X 100 ML")).toBe("RUMINAL 88 X 100 ML");
    expect(normalizeProductName("Adult +7 x 2,5 Kg - Royal Canin")).toBe(
      "ADULT +7 X 2,5 KG - ROYAL CANIN",
    );
  });

  it("string vacío / solo espacios → vacío", () => {
    expect(normalizeProductName("")).toBe("");
    expect(normalizeProductName("   ")).toBe("");
  });
});

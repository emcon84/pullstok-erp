import { describe, it, expect } from "vitest";
import { suggestLooseCells, type LooseCell } from "@/lib/openBagCells";

const cell = (over: Partial<LooseCell> & { id: string }): LooseCell => ({
  brandName: "Excellent",
  brandKeywords: [],
  typeName: "Adulto",
  typeSynonyms: [],
  species: "PERRO",
  priceKg: 5000,
  label: over.id,
  ...over,
});

const cells: LooseCell[] = [
  cell({ id: "ex-ad-dog", typeSynonyms: ["adult"] }),
  cell({ id: "ex-cach-dog", typeName: "Cachorro", typeSynonyms: ["puppy"] }),
  cell({ id: "ex-ad-cat", species: "GATO", typeSynonyms: ["adult"] }),
  cell({ id: "pp-ad-dog", brandName: "Pro Plan", brandKeywords: ["proplan"] }),
  cell({ id: "rc-ad-dog", brandName: "Royal Canin", brandKeywords: ["royal"] }),
];
const ids = (r: { cells: LooseCell[] }) => r.cells.map((c) => c.id);

describe("suggestLooseCells", () => {
  it("matches the brand ignoring case and accents", () => {
    const r = suggestLooseCells("EXCELLENT Perro Adulto 15kg", null, cells);
    expect(r.brandMatched).toBe(true);
    expect(ids(r)).toEqual(["ex-ad-dog"]);
  });

  it("matches through brand keywords, also when the name is written without spaces", () => {
    expect(ids(suggestLooseCells("Proplan Adulto 15kg", null, cells))).toEqual(["pp-ad-dog"]);
    expect(ids(suggestLooseCells("PRO PLAN Adulto 15kg", null, cells))).toEqual(["pp-ad-dog"]);
    expect(ids(suggestLooseCells("Royal 15kg", null, cells))).toEqual(["rc-ad-dog"]);
  });

  it("does not match a brand inside another word", () => {
    const r = suggestLooseCells("Exceller", null, [cell({ id: "a", brandName: "Excel" })]);
    expect(r.brandMatched).toBe(false);
  });

  it("returns no cells when no brand matches", () => {
    const r = suggestLooseCells("Whiskas atun", null, cells);
    expect(r).toEqual({ cells: [], brandMatched: false });
  });

  it("narrows by type synonyms (puppy -> Cachorro)", () => {
    expect(ids(suggestLooseCells("Excellent Puppy 15kg", null, cells))).toEqual(["ex-cach-dog"]);
  });

  it("narrows by species taken from the product name or category", () => {
    expect(ids(suggestLooseCells("Excellent Gato Adulto", null, cells))).toEqual(["ex-ad-cat"]);
    expect(ids(suggestLooseCells("Excellent Adulto", "Alimento Gatos Cat", cells))).toEqual(["ex-ad-cat"]);
  });

  it("keeps AMBOS cells when narrowing by species", () => {
    const withBoth = [...cells, cell({ id: "ex-ad-both", species: "AMBOS" })];
    expect(ids(suggestLooseCells("Excellent Gato", null, withBoth))).toEqual(["ex-ad-cat", "ex-ad-both"]);
  });

  it("falls back to the broader set when narrowing would leave nothing", () => {
    // 'Senior' matches no type; Gato narrows species only
    const r = suggestLooseCells("Excellent Senior", null, cells);
    expect(ids(r)).toEqual(["ex-ad-dog", "ex-cach-dog", "ex-ad-cat"]);
    const noCatCells = cells.filter((c) => c.id !== "ex-ad-cat");
    expect(ids(suggestLooseCells("Excellent Gato", null, noCatCells))).toEqual(["ex-ad-dog", "ex-cach-dog"]);
  });

  it("prefers the longest matching brand term", () => {
    const list = [
      cell({ id: "rc", brandName: "Royal Canin", brandKeywords: ["royal"] }),
      cell({ id: "rcv", brandName: "Royal Canin Veterinary", brandKeywords: [] }),
    ];
    expect(ids(suggestLooseCells("Royal Canin Veterinary Renal", null, list))).toEqual(["rcv"]);
  });
  describe("razas narrowing", () => {
    const dc = (id: string, typeName: string, extra: Partial<LooseCell> = {}) =>
      cell({ id, brandName: "Dog Chow", brandKeywords: [], typeName, ...extra });

    it("prefers the RP cell over the generic stage type (exact Dog Chow case)", () => {
      const list = [dc("ad", "Adulto"), dc("cach", "Cachorro"), dc("rp", "RP"), dc("rm", "RM")];
      const r = suggestLooseCells("DOG CHOW ADULT RAZAS PEQUEÑAS X20KG", "ALIMENTO SECO", list);
      expect(ids(r)).toEqual(["rp"]);
      expect(r.brandMatched).toBe(true);
    });

    it("prefers 'Adulto RP' over plain 'Adulto'", () => {
      const list = [dc("ad", "Adulto"), dc("adrp", "Adulto RP")];
      expect(ids(suggestLooseCells("Dog Chow Adulto Razas Pequeñas 20kg", null, list))).toEqual(["adrp"]);
    });

    it("matches medianas and grandes", () => {
      const list = [dc("ad", "Adulto"), dc("rm", "RM"), dc("rg", "Razas Grandes")];
      expect(ids(suggestLooseCells("Dog Chow Adulto Razas Medianas", null, list))).toEqual(["rm"]);
      expect(ids(suggestLooseCells("Dog Chow Adulto Razas Grandes", null, list))).toEqual(["rg"]);
    });

    it("matches through synonyms and accents/case", () => {
      const list = [dc("ad", "Adulto"), dc("x", "Mini Breed", { typeSynonyms: ["Pequeñas"] })];
      expect(ids(suggestLooseCells("DOG CHOW RAZAS PEQUENAS", null, list))).toEqual(["x"]);
    });

    it("does not match token substrings (RP inside another word)", () => {
      const list = [dc("ad", "Adulto"), dc("w", "Superp")];
      expect(ids(suggestLooseCells("Dog Chow Razas Pequeñas", null, list))).toEqual(["ad", "w"]);
    });

    it("is unchanged when the product has no razas hint", () => {
      const list = [dc("ad", "Adulto"), dc("rp", "RP")];
      expect(ids(suggestLooseCells("Dog Chow Adulto 20kg", null, list))).toEqual(["ad"]);
    });

    it("falls back to current behavior when no cell matches the razas", () => {
      const list = [dc("ad", "Adulto"), dc("cach", "Cachorro"), dc("rm", "RM")];
      expect(ids(suggestLooseCells("Dog Chow Adulto Razas Pequeñas", null, list))).toEqual(["ad"]);
    });

    it("still narrows by species after razas", () => {
      const list = [dc("rp-dog", "RP"), dc("rp-cat", "RP", { species: "GATO" })];
      expect(ids(suggestLooseCells("Dog Chow Razas Pequeñas Perro", null, list))).toEqual(["rp-dog"]);
    });
  });
});

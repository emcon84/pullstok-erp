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

  describe("razas encoded in the brand name (production data)", () => {
    const prod: LooseCell[] = [
      cell({ id: "dc-ad", brandName: "DOG CHOW", typeName: "Adulto", typeSynonyms: ["adult"], priceKg: 3600 }),
      cell({ id: "dc-cach", brandName: "DOG CHOW", typeName: "Cachorro", typeSynonyms: ["puppy"] }),
      cell({ id: "dc-sen", brandName: "DOG CHOW", typeName: "Senior" }),
      cell({ id: "dcrp-ad", brandName: "DOG CHOW RP", typeName: "Adulto", typeSynonyms: ["adult"], priceKg: 3800 }),
      cell({ id: "dcrp-cach", brandName: "DOG CHOW RP", typeName: "Cachorro", typeSynonyms: ["puppy"], priceKg: 4100 }),
      cell({ id: "ex-ad-cat", brandName: "EXCELLENT", typeName: "Adulto", typeSynonyms: ["adult"], species: "GATO", priceKg: 10000 }),
      cell({ id: "ex-ad-dog", brandName: "EXCELLENT", typeName: "Adulto", typeSynonyms: ["adult"], species: "PERRO", priceKg: 5500 }),
      cell({ id: "exrp-ad", brandName: "EXCELLENT RP", typeName: "Adulto", typeSynonyms: ["adult"], species: "PERRO" }),
      cell({ id: "exrp-cach", brandName: "EXCELLENT RP", typeName: "Cachorro", typeSynonyms: ["puppy"], species: "PERRO" }),
      cell({ id: "rc-card", brandName: "ROYAL CANIN RP CARDIO", typeName: "Adulto" }),
    ];

    it("picks the 'DOG CHOW RP' brand cell for a razas pequeñas product", () => {
      const r = suggestLooseCells("DOG CHOW ADULT RAZAS PEQUEÑAS X20KG", "ALIMENTO SECO", prod);
      expect(ids(r)).toEqual(["dcrp-ad"]);
      expect(r.genericBrandName).toBe("DOG CHOW");
    });

    it("still picks by type inside the RP brand", () => {
      expect(ids(suggestLooseCells("DOG CHOW PUPPY RAZAS PEQUEÑAS X3KG", null, prod))).toEqual(["dcrp-cach"]);
    });

    it("keeps species narrowing inside the RP brand", () => {
      expect(ids(suggestLooseCells("EXCELLENT ADULT RAZAS PEQUEÑAS PERRO X15KG", null, prod))).toEqual(["exrp-ad"]);
    });

    it("never suggests RP brands when the product has no razas hint", () => {
      expect(ids(suggestLooseCells("DOG CHOW ADULT X20KG", null, prod))).toEqual(["dc-ad"]);
      expect(ids(suggestLooseCells("EXCELLENT ADULT PERRO X15KG", null, prod))).toEqual(["ex-ad-dog"]);
    });

    it("keeps the generic brand when no razas brand exists", () => {
      const only = prod.filter((c) => c.brandName === "DOG CHOW");
      expect(ids(suggestLooseCells("DOG CHOW ADULT RAZAS PEQUEÑAS", null, only))).toEqual(["dc-ad"]);
    });

    it("accepts the razas token anywhere in the brand and PEQ/MED/GR synonyms", () => {
      const list = [
        cell({ id: "g", brandName: "Kongo" }),
        cell({ id: "peq", brandName: "Kongo Peq" }),
        cell({ id: "med", brandName: "MED Kongo" }),
      ];
      expect(ids(suggestLooseCells("Kongo Adulto Razas Pequeñas", null, list))).toEqual(["peq"]);
      expect(ids(suggestLooseCells("Kongo Adulto Razas Medianas", null, list))).toEqual(["med"]);
    });
  });
});

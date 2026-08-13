import { normalizeName } from "../../src/services/providerPriceListService";

/**
 * Name normalization for exact matching (spec REQ-4, design §4). The goal:
 * "SIEGER Puppy Mini x 1 Kg." must normalize to the same token as
 * "sieger puppy mini 1kg" so post-normalization equality is a valid match.
 *
 * Canonical form:
 * - The space between a quantity and its unit collapses ("1 Kg." → "1kg").
 * - Pack-format words ("bolsa", "sobre", "lata", ...) and a standalone pack
 *   "x" before a quantity are dropped, so the same product packed differently
 *   still matches ("SIEGER Ultra Vita Plus - bolsa x 1,5 Kg." ≡ previo
 *   "SIEGER ULTRA VITA PLUS 1.5 KG").
 */
describe("normalizeName — deterministic exact-match keys", () => {
  it("normalizes the spec equivalence (SIEGER Puppy Mini x 1 Kg. ≡ sieger puppy mini 1kg)", () => {
    expect(normalizeName("SIEGER Puppy Mini x 1 Kg.")).toBe(
      normalizeName("sieger puppy mini 1kg"),
    );
  });

  it("strips diacritics (Salmón → salmon)", () => {
    expect(normalizeName("Salmón")).toBe("salmon");
  });

  it("drops the standalone pack 'x' before a quantity and collapses quantity-unit space", () => {
    expect(normalizeName("SIEGER Puppy Mini x 1 Kg.")).toBe("sieger puppy mini 1kg");
  });

  it("turns comma decimal quantities into dot (1,5 Kg → 1.5kg)", () => {
    expect(normalizeName("SIEGER Senior +7 x 1,5 Kg.")).toBe("sieger senior +7 1.5kg");
  });

  it("normalizes unit words (Kilos → kg, grs → g, litros → l, unidades → un)", () => {
    expect(normalizeName("x 2 Kilos")).toBe("2kg");
    expect(normalizeName("x 340 grs.")).toBe("340g");
    expect(normalizeName("x 1 Litro")).toBe("1l");
    expect(normalizeName("x 6 Unidades")).toBe("6un");
  });

  it("replaces parentheses with space (x 340 gr (carne) ≡ x 340 gr carne)", () => {
    expect(normalizeName("Sieger Vet ONC (carne) x 340 gr.")).toBe(
      "sieger vet onc carne 340g",
    );
  });

  it("replaces hyphens with space and drops the pack word (super-premium ≡ super premium)", () => {
    expect(normalizeName("SIEGER Ultra Osteoarticular - bolsa x 1,5 Kg.")).toBe(
      "sieger ultra osteoarticular 1.5kg",
    );
  });

  it("strips a trailing dot and collapses whitespace", () => {
    expect(normalizeName("  AGILITY   CATS KITTEN X 1.5 KG.  ")).toBe(
      "agility cats kitten 1.5kg",
    );
  });

  it("normalizes a real pair: PDF name vs catalog name", () => {
    // PDF (from fixture) vs a plausible catalog spelling.
    expect(normalizeName("SIEGER Puppy Mini x 1 Kg.")).toBe(
      normalizeName("Sieger Puppy Mini x 1kg"),
    );
  });

  it("keeps the plus sign meaningful", () => {
    expect(normalizeName("AGILITY + Adult Dog All Breed Cordero x 1,5 Kg.")).toBe(
      "agility + adult dog all breed cordero 1.5kg",
    );
  });
});

describe("normalizeName — pack-format normalization (fix: bolsa x)", () => {
  it("joins the real duplicate pair: previo 'SIEGER ULTRA VITA PLUS 1.5 KG' ≡ planilla 'bolsa x 1,5 Kg.'", () => {
    expect(normalizeName("SIEGER ULTRA VITA PLUS 1.5 KG")).toBe(
      normalizeName("SIEGER Ultra Vita Plus - bolsa x 1,5 Kg."),
    );
  });

  it("drops 'bolsa x' but keeps the quantity (bolsa x 1,5 Kg. ≡ 1.5 kg)", () => {
    expect(normalizeName("AGILITY Adultos - bolsa x 15 Kg.")).toBe(
      normalizeName("agility adultos 15 kg"),
    );
    expect(normalizeName("AGILITY Adultos - bolsa x 15 Kg.")).toBe("agility adultos 15kg");
  });

  it("drops a pack word without 'x' (bolsa 15 Kg. → 15kg)", () => {
    expect(normalizeName("AGILITY Adultos - bolsa 15 Kg.")).toBe("agility adultos 15kg");
  });

  it("drops a standalone uppercase 'X' before a quantity (X 1.5 KG. → 1.5kg)", () => {
    expect(normalizeName("AGILITY CATS ADULTOS X 1.5 KG.")).toBe("agility cats adultos 1.5kg");
  });

  it("KEEPS the decimal: 1,5 Kg. ≠ 15 Kg. (critical case)", () => {
    const small = normalizeName("AGILITY Adulto Talla Pequeña x 1,5 Kg.");
    const big = normalizeName("AGILITY Adulto Talla Pequeña x 15 Kg.");
    expect(small).toBe("agility adulto talla pequena 1.5kg");
    expect(big).toBe("agility adulto talla pequena 15kg");
    expect(small).not.toBe(big);
  });

  it("does NOT touch an 'x' or pack word inside a word (MAXXIUM / MAXIBOLSA stay intact)", () => {
    expect(normalizeName("MAXXIUM PERROS x 15 Kg.")).toBe("maxxium perros 15kg");
    expect(normalizeName("MAXIBOLSA 5 Kg")).toBe("maxibolsa 5kg");
  });

  it("does NOT drop 'x' not followed by a quantity (x suelto sin cantidad queda)", () => {
    expect(normalizeName("SIEGER PUPPY x")).toBe("sieger puppy x");
    expect(normalizeName("AGILITY x ADULTOS")).toBe("agility x adultos");
  });
});

describe("normalizeName — WET EO y unidades pegadas (dry-run 082026 WET)", () => {
  it("normalizes EO positioned AFTER the quantity (catálogo '340 GR EO' ≡ planilla 'x 340 gr. EO')", () => {
    expect(normalizeName("AGILITY CACHORRO 340 GR EO")).toBe(
      normalizeName("Agility Cachorro x 340 gr. EO"),
    );
  });
  it("collapses the duplicated EO in the WET planilla (catálogo 'WET EO 340 GR' ≡ planilla 'WET EO x 340 gr. EO')", () => {
    expect(normalizeName("KATZE ADULT URINARY WET EO 340 GR")).toBe(
      normalizeName("Katze Adult Urinary WET EO x 340 gr. EO"),
    );
  });
  it("keeps a SINGLE EO intact (no false removal)", () => {
    expect(normalizeName("7 VIDAS CARNE 90 GR EO")).toBe("7 vidas carne 90g eo");
  });
  it("normalizes a unit glued to the digit with no space (100gr ≡ 100 gr)", () => {
    expect(normalizeName("SIEGER PERRO ADULTO WET SALMON Y POLLO 100 GR")).toBe(
      normalizeName("Sieger Perro Adulto WET Salmon y Pollo x 100gr."),
    );
    expect(normalizeName("SIEGER PERRO ADULTO WET SALMON Y POLLO 340 GR EO")).toBe(
      normalizeName("Sieger Perro Adulto WET Salmon y Pollo x 340gr. EO"),
    );
  });
  it("does NOT strip eo from inside a word (gea / recovery keep their letters)", () => {
    expect(normalizeName("SIEGER RECOVERY x 100 gr.")).toBe("sieger recovery 100g");
    expect(normalizeName("AGILITY GEA x 340 gr.")).toBe("agility gea 340g");
  });
});

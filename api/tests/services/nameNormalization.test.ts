import { normalizeName } from "../../src/services/providerPriceListService";

/**
 * Name normalization for exact matching (spec REQ-4, design §4). The goal:
 * "SIEGER Puppy Mini x 1 Kg." must normalize to the same token as
 * "sieger puppy mini x 1kg" so post-normalization equality is a valid match.
 *
 * Canonical form: the space between a quantity and its unit collapses
 * ("1 Kg." → "1kg") so both spellings produce the same token.
 */
describe("normalizeName — deterministic exact-match keys", () => {
  it("normalizes the spec equivalence (SIEGER Puppy Mini x 1 Kg. ≡ sieger puppy mini x 1kg)", () => {
    expect(normalizeName("SIEGER Puppy Mini x 1 Kg.")).toBe(
      normalizeName("sieger puppy mini x 1kg"),
    );
  });

  it("strips diacritics (Salmón → salmon)", () => {
    expect(normalizeName("Salmón")).toBe("salmon");
  });

  it("keeps the pack 'x' and collapses quantity-unit space (x 1 Kg. → x 1kg)", () => {
    expect(normalizeName("SIEGER Puppy Mini x 1 Kg.")).toBe("sieger puppy mini x 1kg");
  });

  it("turns comma decimal quantities into dot (1,5 Kg → 1.5kg)", () => {
    expect(normalizeName("SIEGER Senior +7 x 1,5 Kg.")).toBe("sieger senior +7 x 1.5kg");
  });

  it("normalizes unit words (Kilos → kg, grs → g, litros → l, unidades → un)", () => {
    expect(normalizeName("x 2 Kilos")).toBe("x 2kg");
    expect(normalizeName("x 340 grs.")).toBe("x 340g");
    expect(normalizeName("x 1 Litro")).toBe("x 1l");
    expect(normalizeName("x 6 Unidades")).toBe("x 6un");
  });

  it("replaces parentheses with space (x 340 gr (carne) ≡ x 340 gr carne)", () => {
    expect(normalizeName("Sieger Vet ONC (carne) x 340 gr.")).toBe(
      "sieger vet onc carne x 340g",
    );
  });

  it("replaces hyphens with space (super-premium ≡ super premium)", () => {
    expect(normalizeName("SIEGER Ultra Osteoarticular - bolsa x 1,5 Kg.")).toBe(
      "sieger ultra osteoarticular bolsa x 1.5kg",
    );
  });

  it("strips a trailing dot and collapses whitespace", () => {
    expect(normalizeName("  AGILITY   CATS KITTEN X 1.5 KG.  ")).toBe(
      "agility cats kitten x 1.5kg",
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
      "agility + adult dog all breed cordero x 1.5kg",
    );
  });
});

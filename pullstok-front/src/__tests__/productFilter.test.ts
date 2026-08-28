import { describe, it, expect } from "vitest";
import {
  parseFilterTerms,
  matchesProductFilter,
  isPurinaProduct,
} from "@/lib/productFilter";
import type { DataItem } from "@/types";

function product(overrides: Partial<DataItem> = {}): DataItem {
  return {
    _id: "p-1",
    name: "Producto Neutro",
    code: "PN-01",
    price: 100,
    quantity: 1,
    ...overrides,
  };
}

describe("parseFilterTerms — coma = OR, espacios = AND", () => {
  it("devuelve [] para filtro vacío o solo comas", () => {
    expect(parseFilterTerms("")).toEqual([]);
    expect(parseFilterTerms("   ")).toEqual([]);
    expect(parseFilterTerms(" , , ")).toEqual([]);
  });

  it("un término sin coma → AND de palabras", () => {
    expect(parseFilterTerms("cat chow")).toEqual([["cat", "chow"]]);
    expect(parseFilterTerms("  Cat   Chow  ")).toEqual([["cat", "chow"]]);
  });

  it("varios términos por coma → OR entre términos", () => {
    expect(parseFilterTerms("Purina, Proplan")).toEqual([
      ["purina"],
      ["proplan"],
    ]);
    expect(parseFilterTerms("Purina, Cat Chow")).toEqual([
      ["purina"],
      ["cat", "chow"],
    ]);
  });

  it("normaliza a minúsculas y descarta términos vacíos", () => {
    expect(parseFilterTerms("Purina,, Proplan,")).toEqual([
      ["purina"],
      ["proplan"],
    ]);
  });
});

describe("matchesProductFilter", () => {
  it("matchea por marca en variantAssignments", () => {
    const p = product({
      variantAssignments: [
        { option: { value: "Purina" } },
        { option: { value: "15 KG" } },
      ],
    } as unknown as DataItem);
    expect(
      matchesProductFilter(p, parseFilterTerms("Purina")),
    ).toBe(true);
    expect(
      matchesProductFilter(p, parseFilterTerms("15")),
    ).toBe(true);
    // Marca que no tiene → false
    expect(
      matchesProductFilter(p, parseFilterTerms("Proplan")),
    ).toBe(false);
  });

  it("OR entre marcas: matchea si el producto es de cualquiera", () => {
    const purina = product({
      variantAssignments: [{ option: { value: "Purina" } }],
    } as unknown as DataItem);
    const proplan = product({
      name: "Proplan Adultos",
      variantAssignments: [{ option: { value: "Proplan" } }],
    } as unknown as DataItem);
    const terms = parseFilterTerms("Purina, Proplan");
    expect(matchesProductFilter(purina, terms)).toBe(true);
    expect(matchesProductFilter(proplan, terms)).toBe(true);
  });

  it("AND dentro del término: todas las palabras deben estar", () => {
    const p = product({
      variantAssignments: [{ option: { value: "Proplan" } }],
    } as unknown as DataItem);
    // "purina proplan" requiere AMBAS en el mismo haystack → false
    expect(
      matchesProductFilter(p, parseFilterTerms("purina proplan")),
    ).toBe(false);
    // "proplan adultos" → false (falta adultos)
    expect(
      matchesProductFilter(p, parseFilterTerms("proplan adultos")),
    ).toBe(false);
  });

  it("sin términos matchea todo", () => {
    expect(
      matchesProductFilter(product(), parseFilterTerms("")),
    ).toBe(true);
  });

  it("sinónimos de raza pequeña: 'razas pequeñas' matchea un producto con SM", () => {
    const p = product({ name: "ROYAL CANIN ADULTO SM X 15 KG" });
    expect(
      matchesProductFilter(p, parseFilterTerms("razas pequeñas")),
    ).toBe(true);
  });

  it("'royal canin adulto razas peq' matchea producto con SM", () => {
    const p = product({ name: "ROYAL CANIN ADULTO SM X 15 KG" });
    expect(
      matchesProductFilter(p, parseFilterTerms("royal canin adulto razas peq")),
    ).toBe(true);
  });

  it("'razas grandes', 'razas medianas' y 'razas medianas o grandes' matchean LG", () => {
    const p = product({ name: "ROYAL CANIN ADULTO LG X 15 KG" });
    expect(matchesProductFilter(p, parseFilterTerms("razas grandes"))).toBe(true);
    expect(matchesProductFilter(p, parseFilterTerms("razas medianas"))).toBe(true);
    expect(matchesProductFilter(p, parseFilterTerms("razas medianas o grandes"))).toBe(true);
  });

  it("frase literal: 'razas pequeñas' matchea nombre con 'RAZAS PEQUEÑAS'", () => {
    const p = product({ name: "SIEGER SENIOR RAZAS PEQUEÑAS Y RAZAS M&G" });
    expect(
      matchesProductFilter(p, parseFilterTerms("razas pequeñas")),
    ).toBe(true);
  });

  it("producto sin raza no matchea 'razas pequeñas'", () => {
    const p = product({ name: "PURINA ADULTOS X 15 KG" });
    expect(
      matchesProductFilter(p, parseFilterTerms("razas pequeñas")),
    ).toBe(false);
  });

  it("regresión: 'cat chow' sigue matcheando con AND de palabras", () => {
    const p = product({ name: "CAT CHOW ADULTOS CARNE X 15 KG" });
    expect(matchesProductFilter(p, parseFilterTerms("cat chow"))).toBe(true);
    const other = product({ name: "PURINA ADULTOS X 15 KG" });
    expect(matchesProductFilter(other, parseFilterTerms("cat chow"))).toBe(false);
  });
});

describe("isPurinaProduct", () => {
  it("matchea las marcas del grupo Purina por prefijo de nombre", () => {
    expect(isPurinaProduct(product({ name: "PRO PLAN DOG ADULT X3KG" }))).toBe(true);
    expect(isPurinaProduct(product({ name: "CAT CHOW ADULT PESCADO X3KG" }))).toBe(true);
    expect(isPurinaProduct(product({ name: "DOG CHOW ADULT RAZAS PEQUEÑAS X3KG" }))).toBe(true);
    expect(isPurinaProduct(product({ name: "EXCELLENT DOG ADULT X3KG" }))).toBe(true);
    // Marca del portafolio Purina completa (Dogui, Bonelo, Bonzo, Gati).
    expect(isPurinaProduct(product({ name: "DOGUI ADULTO X 15 KG" }))).toBe(true);
    expect(isPurinaProduct(product({ name: "BONELO ADULTO CARNE X 20 KG" }))).toBe(true);
    expect(isPurinaProduct(product({ name: "BONZO ADULTO X 21 KG" }))).toBe(true);
    expect(isPurinaProduct(product({ name: "GATI ADULTO CARNE X 1 KG" }))).toBe(true);
  });

  it("matchea por la variante Marca cuando el nombre no arranca con el prefijo", () => {
    // "FELIX MEGAMIX GATITOS" es de la línea Gati → lo detecta por la Marca.
    const p = product({
      name: "FELIX MEGAMIX GATITOS X 15 KG",
      variantAssignments: [{ option: { value: "Gati" } }],
    } as unknown as DataItem);
    expect(isPurinaProduct(p)).toBe(true);
    // Producto con Marca Purina pero nombre neutro → true.
    const q = product({
      name: "BOLSA 15 KG",
      variantAssignments: [{ option: { value: "Dogui" } }],
    } as unknown as DataItem);
    expect(isPurinaProduct(q)).toBe(true);
  });

  it("matchea nombre que contiene PURINA", () => {
    expect(isPurinaProduct(product({ name: "PURINA ONE ADULT X 3 KG" }))).toBe(true);
  });

  it("NO matchea marcas que no son Purina", () => {
    expect(isPurinaProduct(product({ name: "SIEGER SENIOR X 3 KG" }))).toBe(false);
    expect(isPurinaProduct(product({ name: "BALANCED PERRO ADULTO X 3 KG" }))).toBe(false);
    expect(isPurinaProduct(product({ name: "OLD PRINCE ADULTO X 3 KG" }))).toBe(false);
  });

  it("matchea por brand de la sección de planilla", () => {
    expect(
      isPurinaProduct(
        product({ name: "SOME ORIGINAL NAME", planSection: { brand: "PRO PLAN", line: null, subline: null, position: 0 } }),
      ),
    ).toBe(true);
  });
});

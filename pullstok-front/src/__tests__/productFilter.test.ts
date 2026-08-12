import { describe, it, expect } from "vitest";
import {
  parseFilterTerms,
  matchesProductFilter,
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
});

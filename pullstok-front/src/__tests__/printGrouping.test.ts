import { describe, it, expect } from "vitest";
import { groupByBrand, productBrandOf } from "@/lib/printGrouping";

interface Item {
  id: string;
  name: string;
  brand: string;
}

const item = (id: string, name: string, brand = ""): Item => ({
  id,
  name,
  brand,
});

describe("groupByBrand — agrupación de listados imprimibles", () => {
  it("agrupa por marca y ordena los grupos alfabéticamente (locale es)", () => {
    const items = [
      item("3", "Zeta", "Zap"),
      item("1", "Alfa", "Acme"),
      item("2", "Beta", "Acme"),
    ];

    const groups = groupByBrand(items, (i) => i.brand, (a, b) =>
      a.name.localeCompare(b.name),
    );

    expect(groups.map((g) => g.brand)).toEqual(["Acme", "Zap"]);
    expect(groups[0].items.map((i) => i.name)).toEqual(["Alfa", "Beta"]);
  });

  it("manda 'Sin marca' al final", () => {
    const items = [
      item("1", "Suelto", ""),
      item("2", "Marca", "Purina"),
    ];

    const groups = groupByBrand(items, (i) => i.brand, (a, b) =>
      a.name.localeCompare(b.name),
    );

    expect(groups.map((g) => g.brand)).toEqual(["Purina", "Sin marca"]);
  });

  it("trata whitespace como sin marca", () => {
    const groups = groupByBrand(
      [item("1", "X", "   ")],
      (i) => i.brand,
      (a, b) => a.name.localeCompare(b.name),
    );
    expect(groups.map((g) => g.brand)).toEqual(["Sin marca"]);
  });

  it("devuelve [] para items vacíos", () => {
    expect(
      groupByBrand<Item>([], (i) => i.brand, (a, b) => a.name.localeCompare(b.name)),
    ).toEqual([]);
  });

  it("productBrandOf lee la variante 'Marca' del DataItem", () => {
    const withBrand = {
      variantAssignments: [
        { option: { value: "15 KG", variant: { name: "Tamaño" } } },
        { option: { value: "Purina", variant: { name: "Marca" } } },
      ],
    };
    expect(productBrandOf(withBrand)).toBe("Purina");

    const withoutBrand = { variantAssignments: [] };
    expect(productBrandOf(withoutBrand)).toBe("");
    expect(productBrandOf({})).toBe("");
  });
});

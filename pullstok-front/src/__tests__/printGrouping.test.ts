import { describe, it, expect } from "vitest";
import { groupByBrand, productBrandOf, groupByPdfHierarchy } from "@/lib/printGrouping";

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

describe("groupByPdfHierarchy — jerarquía del PDF para la planilla mayorista", () => {
  const section = (
    id: string,
    position: number,
    entries: { position: number; name: string }[],
    brand: string | null = "SIEGER",
  ) => ({ id, brand, line: null, subline: null, position, entries });

  it("ordena secciones por position y entradas por position", () => {
    const sections = [
      section("s2", 1, [
        { position: 1, name: "B" },
        { position: 0, name: "A" },
      ]),
      section("s1", 0, [{ position: 0, name: "X" }]),
    ];
    const result = groupByPdfHierarchy(sections);
    expect(result.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(result[1].entries.map((e) => e.name)).toEqual(["A", "B"]);
  });

  it("descarta secciones sin entradas", () => {
    const sections = [
      section("s-vacia", 0, []),
      section("s-ok", 1, [{ position: 0, name: "A" }]),
    ];
    const result = groupByPdfHierarchy(sections);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("s-ok");
  });

  it("conserva la jerarquía brand/line/subline de cada sección", () => {
    const sections = [
      {
        id: "s1",
        brand: "SIEGER",
        line: "SUPER PREMIUM PARA PERROS",
        subline: "SIEGER PUPPY",
        position: 0,
        entries: [{ position: 0, name: "A" }],
      },
    ];
    const [s] = groupByPdfHierarchy(sections);
    expect(s.brand).toBe("SIEGER");
    expect(s.line).toBe("SUPER PREMIUM PARA PERROS");
    expect(s.subline).toBe("SIEGER PUPPY");
  });
});

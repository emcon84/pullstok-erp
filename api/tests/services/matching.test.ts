import {
  buildCatalogIndex,
  matchByName,
  matchRows,
  type CatalogIndex,
  type ParsedRow,
} from "../../src/services/providerPriceListService";

/** Producto del catálogo tal como lo devuelve el findMany de buildCatalogIndex. */
interface CatalogProduct {
  id: string;
  name: string;
  code: string | null;
  variantAssignments: {
    option: { value: string; variant: { name: string } };
  }[];
}

const product = (
  id: string,
  name: string,
  code: string | null = null,
  brand = "",
): CatalogProduct => ({
  id,
  name,
  code,
  variantAssignments: brand
    ? [{ option: { value: brand, variant: { name: "Marca" } } }]
    : [],
});

const rowsOf = (...names: string[]): ParsedRow[] =>
  names.map((nombre) => ({
    nombre,
    marca: null,
    linea: null,
    sublinea: null,
    unidadEmpaque: null,
    precioSinIva: 100,
    precioConIva: 121,
  }));

describe("buildCatalogIndex — org-scoped, normalized keys → product ids", () => {
  it("queries products scoped to the organization", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    await buildCatalogIndex({ product: { findMany } } as any, "org-1");
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org-1" } }),
    );
  });

  it("maps normalized names to ids (multi-match when the catalog has duplicates)", async () => {
    const findMany = jest.fn().mockResolvedValue([
      product("p1", "SIEGER Puppy Mini x 1 Kg."),
      product("p2", "sieger puppy mini x 1kg"), // mismo token normalizado
      product("p3", "AGILITY Adultos - bolsa x 15 Kg."),
    ]);
    const index = await buildCatalogIndex({ product: { findMany } } as any, "org-1");
    expect(index.byName.get("sieger puppy mini x 1kg")).toEqual(["p1", "p2"]);
    expect(index.byName.get("agility adultos bolsa x 15kg")).toEqual(["p3"]);
    expect(index.names.get("p1")).toBe("SIEGER Puppy Mini x 1 Kg.");
  });

  it("adds normalized code keys as a fallback (byCode)", async () => {
    const findMany = jest.fn().mockResolvedValue([
      product("p1", "Producto X", "ALI-8795"),
    ]);
    const index = await buildCatalogIndex({ product: { findMany } } as any, "org-1");
    expect(index.byCode.get("ali 8795")).toEqual(["p1"]);
  });
});

describe("matchByName — exact post-normalization equality", () => {
  const index: CatalogIndex = {
    byName: new Map([
      ["sieger puppy mini x 1kg", ["p1"]],
      ["sieger kitten x 1kg", ["p2", "p3"]],
    ]),
    byCode: new Map([["ali 8795", ["p9"]]]),
    names: new Map([
      ["p1", "SIEGER Puppy Mini x 1 Kg."],
      ["p2", "Sieger Kitten x 1 kg"],
      ["p3", "Sieger Kitten x 1kg (catálogo)"],
      ["p9", "Producto por código"],
    ]),
  };

  it("returns matched with the productId when exactly one catalog product matches", () => {
    expect(matchByName("sieger puppy mini x 1kg", index)).toEqual({
      estado: "matched",
      productId: "p1",
      productIds: ["p1"],
      matchName: "SIEGER Puppy Mini x 1 Kg.",
    });
  });

  it("returns unmatched when nothing matches", () => {
    expect(matchByName("gooster cachorros x 15 kg", index)).toEqual({
      estado: "unmatched",
    });
  });

  it("returns multi-match with the default first id when the catalog has duplicates", () => {
    const result = matchByName("sieger kitten x 1kg", index);
    expect(result.estado).toBe("multi-match");
    expect(result.productIds).toEqual(["p2", "p3"]);
    expect(result.productId).toBe("p2"); // default = primer id
  });

  it("falls back to byCode when the name does not match", () => {
    expect(matchByName("ali 8795", index).estado).toBe("matched");
    expect(matchByName("ali 8795", index).productId).toBe("p9");
  });
});

describe("matchRows — preview rows with states, duplicates and priority", () => {
  const index: CatalogIndex = {
    byName: new Map([
      ["sieger puppy mini x 1kg", ["p1"]],
      ["duplicado x 1kg", ["p5"]],
      ["otro x 1kg", ["p6", "p7"]],
    ]),
    byCode: new Map(),
    names: new Map([
      ["p1", "SIEGER Puppy Mini x 1 Kg."],
      ["p5", "Duplicado x 1 kg"],
      ["p6", "Otro x 1 kg"],
      ["p7", "Otro x 1 kg (catálogo)"],
    ]),
  };

  it("matches a row, computes the suggested price and keeps the PDF name", () => {
    const [row] = matchRows(
      rowsOf("SIEGER Puppy Mini x 1 Kg."),
      index,
    );
    expect(row.estado).toBe("matched");
    expect(row.productId).toBe("p1");
    expect(row.matchName).toBe("SIEGER Puppy Mini x 1 Kg.");
    expect(row.sugerido).toBe(161.34); // round2(121 × 1.3334)
    expect(row.nombre).toBe("SIEGER Puppy Mini x 1 Kg.");
    expect(row.position).toBe(0);
  });

  it("marks a row without prices as error (not importable)", () => {
    const [row] = matchRows(
      [{ ...rowsOf("STARTER Kit")[0], precioSinIva: null, precioConIva: null }],
      index,
    );
    expect(row.estado).toBe("error");
    expect(row.sugerido).toBeNull();
  });

  it("defaults multi-match rows to the first catalog id", () => {
    const [row] = matchRows(rowsOf("Otro x 1 kg"), index);
    expect(row.estado).toBe("multi-match");
    expect(row.productId).toBe("p6");
    expect(row.productIds).toEqual(["p6", "p7"]);
  });

  it("keeps a product of another org unmatched (scope: not in the index)", () => {
    // El producto de otra org simplemente no está en el índice → unmatched.
    const [row] = matchRows(rowsOf("Ajeno x 1 kg"), index);
    expect(row.estado).toBe("unmatched");
    expect(row.productId).toBeNull();
  });

  it("marks every row of a duplicate group as duplicado (priority over matched)", () => {
    const rows = matchRows(rowsOf("Duplicado x 1 kg", "duplicado x 1kg"), index);
    expect(rows.map((r) => r.estado)).toEqual(["duplicado", "duplicado"]);
    // La prioridad duplicado > matched conserva el match como referencia.
    expect(rows[0].productId).toBe("p5");
  });

  it("keeps error priority over duplicado (error > duplicado)", () => {
    const errorRow: ParsedRow = {
      ...rowsOf("Duplicado x 1 kg")[0],
      precioSinIva: null,
      precioConIva: null,
    };
    const rows = matchRows([errorRow, rowsOf("duplicado x 1kg")[0]], index);
    expect(rows[0].estado).toBe("error");
    expect(rows[1].estado).toBe("duplicado");
  });

  it("assigns incremental positions in PDF order", () => {
    const rows = matchRows(rowsOf("A", "B", "C"), {
      byName: new Map(),
      byCode: new Map(),
      names: new Map(),
    });
    expect(rows.map((r) => r.position)).toEqual([0, 1, 2]);
  });
});

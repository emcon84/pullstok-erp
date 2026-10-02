import {
  CATALOG,
  CATEGORY_PATHS,
  GROUPS,
  expandGroups,
  planLoad,
  planStock,
  validateCatalog,
  type Group,
  type StockCandidate,
} from "../../scripts/data/accesorios-listas";

const group = (over: Partial<Group> = {}): Group => ({
  category: CATEGORY_PATHS.COLLARES,
  brand: "JAMIRO",
  base: "COLLAR NYLON",
  rows: [
    ["26CM", 2000],
    ["33CM", 2200],
  ],
  ...over,
});

describe("expandGroups", () => {
  it("builds 'BASE SIZE BRAND' names, one product per row", () => {
    const items = expandGroups([group()]);
    expect(items.map((i) => i.name)).toEqual([
      "COLLAR NYLON 26CM JAMIRO",
      "COLLAR NYLON 33CM JAMIRO",
    ]);
    expect(items.map((i) => i.price)).toEqual([2000, 2200]);
    expect(items[0].category).toBe(CATEGORY_PATHS.COLLARES);
    expect(items[0].brand).toBe("JAMIRO");
  });

  it("omits the brand when the sheet has none and the size when the row has none", () => {
    const items = expandGroups([
      group({ brand: null, base: "MOCHILA", rows: [["", 29000]] }),
    ]);
    expect(items[0].name).toBe("MOCHILA");
  });
});

describe("validateCatalog", () => {
  it("accepts a clean catalog", () => {
    expect(validateCatalog(expandGroups([group()]))).toEqual([]);
  });

  it("reports duplicated names (case-insensitive)", () => {
    const problems = validateCatalog(
      expandGroups([group(), group({ base: "collar nylon" })]),
    );
    expect(problems.some((p) => /duplicate/i.test(p))).toBe(true);
  });

  it("reports non-positive or non-integer prices", () => {
    const problems = validateCatalog(
      expandGroups([group({ rows: [["A", 0], ["B", 10.5]] })]),
    );
    expect(problems).toHaveLength(2);
  });

  it("reports unknown categories", () => {
    const problems = validateCatalog(
      expandGroups([group({ category: "NOPE > NOPE" as never })]),
    );
    expect(problems.some((p) => /category/i.test(p))).toBe(true);
  });
});

describe("planLoad", () => {
  const items = expandGroups([
    group(),
    group({ category: CATEGORY_PATHS.CORREAS, base: "CORREA NYLON", rows: [["120X15", 4500]] }),
  ]);
  const ids = new Map<string, string>([[CATEGORY_PATHS.COLLARES, "cat-collares"]]);

  it("attaches the category id and skips names that already exist (case-insensitive)", () => {
    const plan = planLoad(items, ids, new Set(["collar nylon 26cm jamiro"]));
    expect(plan.toCreate.map((p) => p.name)).toEqual(["COLLAR NYLON 33CM JAMIRO"]);
    expect(plan.toCreate[0].categoryId).toBe("cat-collares");
    expect(plan.existing.map((p) => p.name)).toEqual(["COLLAR NYLON 26CM JAMIRO"]);
  });

  it("reports categories missing in the org and does not create their items", () => {
    const plan = planLoad(items, ids, new Set());
    expect(plan.missingCategories).toEqual([CATEGORY_PATHS.CORREAS]);
    expect(plan.toCreate.some((p) => p.name.startsWith("CORREA"))).toBe(false);
  });
});

describe("planStock", () => {
  const catalogNames = new Set(["COLLAR NYLON 26CM JAMIRO", "COLLAR NYLON 33CM JAMIRO"]);
  const cand = (over: Partial<StockCandidate> = {}): StockCandidate => ({
    id: "p1",
    name: "COLLAR NYLON 26CM JAMIRO",
    quantity: 0,
    rows: [],
    ...over,
  });

  it("plans only catalog products with no stock yet", () => {
    const plan = planStock(
      [cand(), cand({ id: "p2", name: "OTRO PRODUCTO" })],
      catalogNames,
      "hq",
    );
    expect(plan.toSet.map((p) => p.id)).toEqual(["p1"]);
    expect(plan.skipped).toEqual([]);
  });

  it("matches names case-insensitively", () => {
    const plan = planStock([cand({ name: "collar nylon 26cm jamiro" })], catalogNames, "hq");
    expect(plan.toSet).toHaveLength(1);
  });

  it("skips products that already have stock so counted stock is never overwritten", () => {
    const plan = planStock(
      [
        cand({ id: "a", quantity: 7 }),
        cand({ id: "b", name: "COLLAR NYLON 33CM JAMIRO", rows: [{ branchId: "hq", quantity: 3 }] }),
      ],
      catalogNames,
      "hq",
    );
    expect(plan.toSet).toEqual([]);
    expect(plan.skipped.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("flags whether the HQ stock row already exists (update vs create)", () => {
    const plan = planStock(
      [cand({ rows: [{ branchId: "hq", quantity: 0 }] }), cand({ id: "p2", name: "COLLAR NYLON 33CM JAMIRO" })],
      catalogNames,
      "hq",
    );
    expect(plan.toSet.map((p) => p.hasHqRow)).toEqual([true, false]);
  });
});

describe("transcribed catalog", () => {
  it("has no validation problems", () => {
    expect(validateCatalog(CATALOG)).toEqual([]);
  });

  it("keeps the raw group count in sync with the expanded catalog", () => {
    const rows = GROUPS.reduce((n, g) => n + g.rows.length, 0);
    expect(CATALOG).toHaveLength(rows);
  });

  it.each([
    ["COLLAR NYLON 26CM JAMIRO", 2000],
    ["BOZAL SUELA N0 A-EME", 2800],
    ["MOISES REDONDO 65CM DIAM EL ALMACEN", 39500],
    ["COLCHONETA SOFT ESTAMPADA CON CIERRE 105X75", 51900],
    ["PLATO ACERO 34CM", 12600],
  ])("contains %s at $%i", (name, price) => {
    const found = CATALOG.find((i) => i.name === name);
    expect(found?.price).toBe(price);
  });
});

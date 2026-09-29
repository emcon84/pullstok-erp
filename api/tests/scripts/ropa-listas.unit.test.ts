import {
  CATALOG,
  CATEGORY_PATHS,
  GROUPS,
  PENDING,
  expandGroups,
  planLoad,
  planStock,
  validateCatalog,
  type Group,
  type StockCandidate,
} from "../../scripts/data/ropa-listas";

const group = (over: Partial<Group> = {}): Group => ({
  category: CATEGORY_PATHS.ROPA,
  brand: null,
  base: "POLERA",
  rows: [
    ["TALLE 20", 7000],
    ["TALLE 25", 7500],
  ],
  ...over,
});

describe("expandGroups", () => {
  it("builds 'BASE SIZE BRAND' names, one product per row", () => {
    const items = expandGroups([group()]);
    expect(items.map((i) => i.name)).toEqual(["POLERA TALLE 20", "POLERA TALLE 25"]);
    expect(items.map((i) => i.price)).toEqual([7000, 7500]);
    expect(items[0].category).toBe(CATEGORY_PATHS.ROPA);
    expect(items[0].brand).toBeNull();
  });

  it("omits the brand when the sheet has none and the size when the row has none", () => {
    const items = expandGroups([
      group({ brand: null, base: "MOÑO", rows: [["", 3800]] }),
    ]);
    expect(items[0].name).toBe("MOÑO");
  });
});

describe("validateCatalog", () => {
  it("accepts a clean catalog", () => {
    expect(validateCatalog(expandGroups([group()]))).toEqual([]);
  });

  it("reports duplicated names (case-insensitive)", () => {
    const problems = validateCatalog(
      expandGroups([group(), group({ base: "polera" })]),
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
    group({
      category: CATEGORY_PATHS.ACCESORIOS_INDUMENTARIA,
      base: "MOÑO",
      brand: "BUEN ABRIGO",
      rows: [["", 3800]],
    }),
  ]);
  const ids = new Map<string, string>([[CATEGORY_PATHS.ROPA, "cat-ropa"]]);

  it("attaches the category id and skips names that already exist (case-insensitive)", () => {
    const plan = planLoad(items, ids, new Set(["polera talle 20"]));
    expect(plan.toCreate.map((p) => p.name)).toEqual(["POLERA TALLE 25"]);
    expect(plan.toCreate[0].categoryId).toBe("cat-ropa");
    expect(plan.existing.map((p) => p.name)).toEqual(["POLERA TALLE 20"]);
  });

  it("reports categories missing in the org and does not create their items", () => {
    const plan = planLoad(items, ids, new Set());
    expect(plan.missingCategories).toEqual([CATEGORY_PATHS.ACCESORIOS_INDUMENTARIA]);
    expect(plan.toCreate.some((p) => p.name.startsWith("MOÑO"))).toBe(false);
  });
});

describe("planStock", () => {
  const catalogNames = new Set(["POLERA TALLE 20", "POLERA TALLE 25"]);
  const cand = (over: Partial<StockCandidate> = {}): StockCandidate => ({
    id: "p1",
    name: "POLERA TALLE 20",
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
    const plan = planStock([cand({ name: "polera talle 20" })], catalogNames, "hq");
    expect(plan.toSet).toHaveLength(1);
  });

  it("skips products that already have stock so counted stock is never overwritten", () => {
    const plan = planStock(
      [
        cand({ id: "a", quantity: 7 }),
        cand({ id: "b", name: "POLERA TALLE 25", rows: [{ branchId: "hq", quantity: 3 }] }),
      ],
      catalogNames,
      "hq",
    );
    expect(plan.toSet).toEqual([]);
    expect(plan.skipped.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("flags whether the HQ stock row already exists (update vs create)", () => {
    const plan = planStock(
      [cand({ rows: [{ branchId: "hq", quantity: 0 }] }), cand({ id: "p2", name: "POLERA TALLE 25" })],
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
    ["POLERA TALLE 20", 7000],
    ["BUZO FRISA TALLE 75", 18600],
    ["POLAR LISO TALLE 0 LECHE Y MIEL", 3500],
    ["ROPA TALLE N25 JAMIRO", 3400],
    ["ROPA TALLE 75 LAS CHIQUIS", 14000],
    ["MOÑO BUEN ABRIGO", 3800],
    ["SIN CAPUCHA TALLE 10 BUEN ABRIGO", 13500],
  ])("contains %s at $%i", (name, price) => {
    const found = CATALOG.find((i) => i.name === name);
    expect(found?.price).toBe(price);
  });

  // Structural sanity check: total dataset size + pending count, so a
  // silently dropped or duplicated row shows up here instead of in prod.
  it("has the expected total row count and pending count", () => {
    expect(CATALOG).toHaveLength(137);
    expect(PENDING).toHaveLength(3);
  });
});

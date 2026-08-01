import {
  HEADQUARTERS_BRANCH_NAME,
  planHqStockCreations,
  resolveHqBranch,
  verifyHqStockSum,
} from "../../scripts/migrate-branch-stock";

/**
 * Unit tests for the pure logic of the branch-stock data migration.
 * No DB required — these functions are side-effect free.
 */

describe("resolveHqBranch", () => {
  it("picks the branch flagged isHeadquarters over any name match", () => {
    const branches = [
      { id: "b1", name: "Depósito", isHeadquarters: true },
      { id: "b2", name: HEADQUARTERS_BRANCH_NAME, isHeadquarters: false },
    ];
    expect(resolveHqBranch(branches)?.id).toBe("b1");
  });

  it("falls back to the branch named 'Casa Central' when none is flagged", () => {
    const branches = [
      { id: "b1", name: "Sucursal 1", isHeadquarters: false },
      { id: "b2", name: HEADQUARTERS_BRANCH_NAME, isHeadquarters: false },
    ];
    expect(resolveHqBranch(branches)?.id).toBe("b2");
  });

  it("returns null when no branch is flagged and none is named 'Casa Central'", () => {
    const branches = [
      { id: "b1", name: "Sucursal 1", isHeadquarters: false },
      { id: "b2", name: "Sucursal 2", isHeadquarters: false },
    ];
    expect(resolveHqBranch(branches)).toBeNull();
  });
});

describe("planHqStockCreations", () => {
  const products = [
    { id: "p1", quantity: 10 },
    { id: "p2", quantity: 20 },
    { id: "p3", quantity: 30 },
  ];

  it("plans all products when none has an HQ stock row yet", () => {
    const plan = planHqStockCreations(products, new Set());
    expect(plan).toHaveLength(3);
    expect(plan.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
  });

  it("plans only the products missing an HQ row (idempotency on re-run)", () => {
    const existing = new Set(["p1", "p3"]);
    const plan = planHqStockCreations(products, existing);
    expect(plan).toHaveLength(1);
    expect(plan[0]).toEqual({ id: "p2", quantity: 20 });
  });

  it("plans nothing when every product already has an HQ row", () => {
    const plan = planHqStockCreations(products, new Set(["p1", "p2", "p3"]));
    expect(plan).toHaveLength(0);
  });
});

describe("verifyHqStockSum", () => {
  it("returns true when Σ(ProductStock HQ) equals Σ(Product.quantity)", () => {
    const products = [
      { id: "p1", quantity: 10 },
      { id: "p2", quantity: 20 },
    ];
    const hqStocks = [
      { id: "s1", quantity: 10 },
      { id: "s2", quantity: 20 },
    ];
    expect(verifyHqStockSum(products, hqStocks)).toBe(true);
  });

  it("returns false when the sums differ", () => {
    const products = [
      { id: "p1", quantity: 10 },
      { id: "p2", quantity: 20 },
    ];
    const hqStocks = [
      { id: "s1", quantity: 10 },
      { id: "s2", quantity: 15 },
    ];
    expect(verifyHqStockSum(products, hqStocks)).toBe(false);
  });

  it("returns true for an org with no products and no stock rows", () => {
    expect(verifyHqStockSum([], [])).toBe(true);
  });
});

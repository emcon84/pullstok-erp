import {
  DEFAULT_FAKE_BAGS,
  DEFAULT_FAKE_KG,
  hasWithBagsFlag,
  planLooseStockCreations,
  planProductStockCreations,
  resolveFakeBags,
  resolveFakeKg,
} from "../../scripts/seed-fake-loose-stock";

/**
 * Unit tests for the pure logic of the fake loose-stock seed.
 * No DB required — these functions are side-effect free.
 */

describe("planLooseStockCreations", () => {
  const cells = [
    { id: "c1", priceKg: 3000 },
    { id: "c2", priceKg: 0 },
  ];
  const branches = [{ id: "b1" }, { id: "b2" }];

  it("crea stock ficticio donde no existe la fila (celda, sucursal)", () => {
    const plan = planLooseStockCreations(cells, branches, [], 20);
    expect(plan).toHaveLength(2); // solo la celda con precio × 2 sucursales
    expect(plan.every((op) => op.kind === "create")).toBe(true);
    expect(plan.every((op) => op.quantity === 20)).toBe(true);
  });

  it("no pisa stock real existente > 0", () => {
    const existing = [{ id: "l1", priceKgPriceId: "c1", branchId: "b1", quantity: 50 }];
    const plan = planLooseStockCreations(cells, branches, existing, 20);
    expect(plan).toHaveLength(1); // solo c1×b2 (c1×b1 se salta por stock real)
    expect(
      plan.some((op) => op.priceKgPriceId === "c1" && op.branchId === "b1"),
    ).toBe(false);
  });

  it("actualiza (no crea) la fila existente con quantity <= 0", () => {
    const existing = [{ id: "l1", priceKgPriceId: "c1", branchId: "b1", quantity: 0 }];
    const plan = planLooseStockCreations(cells, branches, existing, 20);
    const zero = plan.find((op) => op.priceKgPriceId === "c1" && op.branchId === "b1");
    expect(zero).toBeDefined();
    expect(zero!.kind).toBe("update");
    expect(zero!.existingId).toBe("l1");
    expect(zero!.quantity).toBe(20);
  });

  it("ignora celdas sin precio suelto", () => {
    const plan = planLooseStockCreations([{ id: "c2", priceKg: 0 }], branches, [], 20);
    expect(plan).toHaveLength(0);
  });
});

describe("planProductStockCreations", () => {
  const products = [
    { id: "p1", priceKgSuelto: 9200 },
    { id: "p2", priceKgSuelto: null },
  ];
  const branches = [{ id: "b1" }];

  it("planea bolsas solo para productos sueltos (flag --with-bags)", () => {
    const plan = planProductStockCreations(products, branches, [], 10);
    expect(plan).toHaveLength(1);
    expect(plan[0].productId).toBe("p1");
    expect(plan[0].quantity).toBe(10);
  });

  it("no pisa stock real de bolsas > 0", () => {
    const existing = [{ id: "s1", productId: "p1", branchId: "b1", quantity: 40 }];
    const plan = planProductStockCreations(products, branches, existing, 10);
    expect(plan).toHaveLength(0);
  });

  it("actualiza (no crea) la fila existente con quantity <= 0", () => {
    const existing = [{ id: "s1", productId: "p1", branchId: "b1", quantity: 0 }];
    const plan = planProductStockCreations(products, branches, existing, 10);
    expect(plan).toHaveLength(1);
    expect(plan[0].kind).toBe("update");
    expect(plan[0].existingId).toBe("s1");
    expect(plan[0].quantity).toBe(10);
  });
});

describe("valores default / configurables", () => {
  it("usa los defaults cuando no hay env", () => {
    expect(DEFAULT_FAKE_KG).toBe(20);
    expect(DEFAULT_FAKE_BAGS).toBe(10);
    expect(resolveFakeKg({})).toBe(DEFAULT_FAKE_KG);
    expect(resolveFakeBags({})).toBe(DEFAULT_FAKE_BAGS);
  });

  it("respeta FAKE_KG / FAKE_BAGS por env", () => {
    expect(resolveFakeKg({ FAKE_KG: "35" })).toBe(35);
    expect(resolveFakeBags({ FAKE_BAGS: "7" })).toBe(7);
  });

  it("rechaza env inválidos y cae al default", () => {
    expect(resolveFakeKg({ FAKE_KG: "0" })).toBe(DEFAULT_FAKE_KG);
    expect(resolveFakeKg({ FAKE_KG: "-5" })).toBe(DEFAULT_FAKE_KG);
    expect(resolveFakeKg({ FAKE_KG: "abc" })).toBe(DEFAULT_FAKE_KG);
    expect(resolveFakeBags({ FAKE_BAGS: "0" })).toBe(DEFAULT_FAKE_BAGS);
  });
});

describe("hasWithBagsFlag", () => {
  it("detecta la flag --with-bags en argv", () => {
    expect(hasWithBagsFlag(["node", "script.js", "--with-bags"])).toBe(true);
    expect(hasWithBagsFlag(["node", "script.js"])).toBe(false);
  });
});

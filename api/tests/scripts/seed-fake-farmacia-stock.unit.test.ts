import { planFakeStock, resolveFakeQty } from "../../scripts/seed-fake-farmacia-stock";

const productIds = ["p1", "p2"];
const branches = [{ id: "b1" }, { id: "b2" }];

describe("planFakeStock", () => {
  it("crea filas para cada (producto, sucursal) sin fila existente", () => {
    const plan = planFakeStock(productIds, branches, [], 50);
    expect(plan).toHaveLength(4);
    expect(plan.every((r) => r.kind === "create" && r.quantity === 50)).toBe(true);
  });

  it("actualiza solo filas existentes con quantity <= 0 (no pisa stock real)", () => {
    const existing = [
      { id: "s1", productId: "p1", branchId: "b1", quantity: 0 },
      { id: "s2", productId: "p2", branchId: "b2", quantity: 30 }, // real > 0 → no se toca
    ];
    const plan = planFakeStock(productIds, branches, existing, 50);
    const s1 = plan.find((r) => r.productId === "p1" && r.branchId === "b1");
    const s2 = plan.find((r) => r.productId === "p2" && r.branchId === "b2");
    expect(s1).toEqual({ kind: "update", existingId: "s1", productId: "p1", branchId: "b1", quantity: 50 });
    expect(s2).toBeUndefined();
    expect(plan).toHaveLength(3);
  });

  it("no crea duplicados para filas existentes con stock real", () => {
    const existing = [
      { id: "s1", productId: "p1", branchId: "b1", quantity: 10 },
      { id: "s2", productId: "p2", branchId: "b2", quantity: 20 },
    ];
    const plan = planFakeStock(productIds, branches, existing, 50);
    expect(plan).toHaveLength(2); // solo los 2 que faltan (real > 0 no se pisan)
  });
});

describe("resolveFakeQty", () => {
  it("default 50", () => expect(resolveFakeQty({})).toBe(50));
  it("lee FAKE_QTY", () => expect(resolveFakeQty({ FAKE_QTY: "120" })).toBe(120));
  it("ignora valores inválidos", () => expect(resolveFakeQty({ FAKE_QTY: "abc" })).toBe(50));
});

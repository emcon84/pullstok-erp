import { describe, it, expect } from "vitest";
import { buildLooseStockRows } from "@/utils/looseStockRows";
import type { LooseStockLine } from "@/services/looseStock";

const brands = [
  { id: "br1", name: "Royal Canin" },
  { id: "br2", name: "Pedigree" },
];
const types = [{ id: "t1", name: "Adulto" }];
const branches = [
  { id: "b1", name: "Sucursal 1" },
  { id: "b2", name: "Sucursal 2" },
];

const plan = [
  { id: "c1", brandId: "br1", typeId: "t1", species: "PERRO" as const, priceKg: 5000 },
  { id: "c2", brandId: "br2", typeId: "t1", species: "PERRO" as const, priceKg: 3000 },
];

const line = (over: Partial<LooseStockLine>): LooseStockLine => ({
  id: "ls1",
  priceKgPriceId: "c1",
  branchId: "b1",
  quantity: 4,
  branchName: "Sucursal 1",
  lineName: "Royal Canin · Adulto",
  species: "PERRO",
  priceKg: 5000,
  ...over,
});

describe("buildLooseStockRows", () => {
  it("with a branch selected, adds a zero-stock row only for cells missing in that branch", () => {
    const rows = buildLooseStockRows({
      plan,
      brands,
      types,
      lines: [line({})],
      branchId: "b1",
      branches,
    });

    expect(rows).toHaveLength(2);
    const fresh = rows.find((r) => r.priceKgPriceId === "c2")!;
    expect(fresh.quantity).toBe(0);
    expect(fresh.branchId).toBe("b1");
    expect(fresh.branchName).toBe("Sucursal 1");
    expect(fresh.lineName).toBe("Pedigree · Adulto");
    expect(fresh.priceKg).toBe(3000);
    expect(rows.find((r) => r.priceKgPriceId === "c1")!.quantity).toBe(4);
  });

  it("with all branches, lists every cell x branch combination, 0 kg where there is no row", () => {
    const rows = buildLooseStockRows({
      plan,
      brands,
      types,
      lines: [line({})],
      branchId: "",
      branches,
    });

    expect(rows).toHaveLength(4);
    const keys = rows.map((r) => `${r.priceKgPriceId}|${r.branchId}`).sort();
    expect(keys).toEqual(["c1|b1", "c1|b2", "c2|b1", "c2|b2"]);
    expect(rows.find((r) => r.priceKgPriceId === "c1" && r.branchId === "b1")!.quantity).toBe(4);
    expect(rows.find((r) => r.priceKgPriceId === "c1" && r.branchId === "b2")!.quantity).toBe(0);
    expect(rows.find((r) => r.priceKgPriceId === "c1" && r.branchId === "b2")!.branchName).toBe(
      "Sucursal 2",
    );
  });

  it("orders rows with stock first, then by line name", () => {
    const rows = buildLooseStockRows({
      plan,
      brands,
      types,
      lines: [line({ priceKgPriceId: "c2", lineName: "Pedigree · Adulto", quantity: 2 })],
      branchId: "b1",
      branches,
    });

    expect(rows.map((r) => r.priceKgPriceId)).toEqual(["c2", "c1"]);
  });

  it("returns only the existing rows when the plan is empty", () => {
    const rows = buildLooseStockRows({
      plan: [],
      brands,
      types,
      lines: [line({})],
      branchId: "b1",
      branches,
    });

    expect(rows).toHaveLength(1);
  });
});

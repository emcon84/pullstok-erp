import { describe, it, expect } from "vitest";
import { buildLooseStockRows } from "@/utils/looseStockRows";
import type { LooseStockLine } from "@/services/looseStock";

const brands = [
  { id: "br1", name: "Royal Canin" },
  { id: "br2", name: "Pedigree" },
];
const types = [{ id: "t1", name: "Adulto" }];

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
  it("adds a zero-stock row for plan cells that have no stock row yet (branch selected)", () => {
    const rows = buildLooseStockRows({
      plan,
      brands,
      types,
      lines: [line({})],
      branchId: "b1",
      branchName: "Sucursal 1",
    });

    expect(rows).toHaveLength(2);
    const fresh = rows.find((r) => r.priceKgPriceId === "c2")!;
    expect(fresh.quantity).toBe(0);
    expect(fresh.branchId).toBe("b1");
    expect(fresh.lineName).toBe("Pedigree · Adulto");
    expect(fresh.priceKg).toBe(3000);
    expect(rows.find((r) => r.priceKgPriceId === "c1")!.quantity).toBe(4);
  });

  it("keeps existing rows untouched when all branches are shown and only adds cells with no row anywhere", () => {
    const rows = buildLooseStockRows({
      plan,
      brands,
      types,
      lines: [line({}), line({ id: "ls2", branchId: "b2", branchName: "Sucursal 2", quantity: 1 })],
      branchId: "",
      branchName: "",
    });

    expect(rows.filter((r) => r.priceKgPriceId === "c1")).toHaveLength(2);
    const fresh = rows.filter((r) => r.priceKgPriceId === "c2");
    expect(fresh).toHaveLength(1);
    expect(fresh[0].branchId).toBe("");
    expect(fresh[0].quantity).toBe(0);
  });

  it("orders rows with stock first, then by line name", () => {
    const rows = buildLooseStockRows({
      plan,
      brands,
      types,
      lines: [line({ priceKgPriceId: "c2", lineName: "Pedigree · Adulto", quantity: 2 })],
      branchId: "b1",
      branchName: "Sucursal 1",
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
      branchName: "Sucursal 1",
    });

    expect(rows).toHaveLength(1);
  });
});

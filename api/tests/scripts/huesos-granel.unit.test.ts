import { normalizeProductName } from "../../src/utils/productName";
import {
  DEFAULT_ORG,
  HUESOS_NAMES,
  HUESOS_ROWS,
  TARGET_CATEGORY,
  planLoad,
  type HuesosRow,
} from "../../scripts/data/huesos-granel";

const row = (over: Partial<HuesosRow> = {}): HuesosRow => ({
  row: 4,
  name: "Hueso corbata 3/4",
  bagQty: 500,
  price: 734,
  ...over,
});

describe("planLoad", () => {
  it("trims and normalizes the name with normalizeProductName", () => {
    const plan = planLoad([row({ name: "  hueso   corbata 3/4 " })], new Set());
    expect(plan.toCreate).toEqual([{ name: "HUESO CORBATA 3/4", price: 734 }]);
  });

  it("stores the price as-is (no VAT)", () => {
    const plan = planLoad([row({ price: 1230 })], new Set());
    expect(plan.toCreate[0].price).toBe(1230);
  });

  it("skips rows without a name, even when they carry a price", () => {
    const plan = planLoad([row({ row: 26, name: "", price: 62 })], new Set());
    expect(plan.toCreate).toEqual([]);
    expect(plan.skipped).toEqual([{ row: 26, text: "", reason: "sin nombre" }]);
  });

  it("skips rows that only have a bag count", () => {
    const plan = planLoad([row({ row: 47, name: "", price: null, bagQty: 50 })], new Set());
    expect(plan.toCreate).toEqual([]);
    expect(plan.skipped).toHaveLength(1);
    expect(plan.skipped[0].reason).toBe("sin nombre");
  });

  it("skips named rows with a null, zero, negative or non-numeric price", () => {
    const plan = planLoad(
      [
        row({ row: 10, name: "A", price: null }),
        row({ row: 11, name: "B", price: 0 }),
        row({ row: 12, name: "C", price: -5 }),
        row({ row: 13, name: "D", price: "abc" as unknown as number }),
      ],
      new Set(),
    );
    expect(plan.toCreate).toEqual([]);
    expect(plan.skipped.map((s) => [s.row, s.text, s.reason])).toEqual([
      [10, "A", "sin precio"],
      [11, "B", "sin precio"],
      [12, "C", "sin precio"],
      [13, "D", "sin precio"],
    ]);
  });

  it("omits names that already exist in the org (case-insensitive, normalized)", () => {
    const plan = planLoad(
      [row({ row: 4, name: "Hueso corbata 3/4" }), row({ row: 5, name: "Roll 4/5", price: 750 })],
      new Set(["hueso  Corbata 3/4"]),
    );
    expect(plan.existing).toEqual([{ row: 4, name: "HUESO CORBATA 3/4" }]);
    expect(plan.toCreate).toEqual([{ name: "ROLL 4/5", price: 750 }]);
  });

  it("keeps the first of the duplicates inside the dataset and lists the rest as skipped", () => {
    const plan = planLoad(
      [
        row({ row: 4, name: "Roll 4/5", price: 750 }),
        row({ row: 9, name: "roll  4/5", price: 800 }),
      ],
      new Set(),
    );
    expect(plan.toCreate).toEqual([{ name: "ROLL 4/5", price: 750 }]);
    expect(plan.skipped).toEqual([
      { row: 9, text: "roll  4/5", reason: "duplicado en la planilla" },
    ]);
  });

  it("does not mutate its inputs", () => {
    const rows: HuesosRow[] = [row(), row({ row: 5, name: "", price: 10 })];
    const snapshot = JSON.parse(JSON.stringify(rows));
    const existing = new Set(["X"]);
    planLoad(rows, existing);
    expect(rows).toEqual(snapshot);
    expect([...existing]).toEqual(["X"]);
  });
});

describe("dataset invariants", () => {
  // 49 filas de datos (Excel 4-62) sin las totalmente vacías; verificado
  // re-parseando la planilla original.
  it("has the expected number of rows", () => {
    expect(HUESOS_ROWS).toHaveLength(49);
  });

  it("targets the PERROS > SNACKS category and the default org", () => {
    expect(TARGET_CATEGORY).toEqual({
      parent: "PERROS",
      leaf: "SNACKS, PREMIOS Y GOLOSINAS",
    });
    expect(DEFAULT_ORG).toBe("1bc3a6c5-1d06-4e40-93ba-12d51a2a2a1b");
  });

  it("keeps rows in ascending Excel order within rows 4-62", () => {
    const nums = HUESOS_ROWS.map((r) => r.row);
    expect([...nums].sort((a, b) => a - b)).toEqual(nums);
    expect(nums[0]).toBeGreaterThanOrEqual(4);
    expect(nums[nums.length - 1]).toBeLessThanOrEqual(62);
  });

  it("plans 36 products to create and 13 skipped rows against an empty org", () => {
    const plan = planLoad(HUESOS_ROWS, new Set());
    expect(plan.toCreate).toHaveLength(36);
    expect(plan.existing).toEqual([]);
    expect(plan.skipped).toHaveLength(13);
    expect(plan.toCreate.length + plan.skipped.length).toBe(HUESOS_ROWS.length);
  });

  it("every product to create has a positive numeric price and a non-empty name", () => {
    const plan = planLoad(HUESOS_ROWS, new Set());
    for (const p of plan.toCreate) {
      expect(typeof p.price).toBe("number");
      expect(Number.isFinite(p.price)).toBe(true);
      expect(p.price).toBeGreaterThan(0);
      expect(normalizeProductName(p.name).length).toBeGreaterThan(0);
      expect(p.name).toBe(normalizeProductName(p.name));
    }
  });

  it("has no duplicate normalized names among the products to create", () => {
    const plan = planLoad(HUESOS_ROWS, new Set());
    const names = plan.toCreate.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("HUESOS_NAMES", () => {
  // Nombres que la carga crea (36 al 2026-09-25): los usan los scripts de
  // stock inicial y de "carried" para tocar SOLO estos productos.
  it("lists exactly the products planLoad creates for an empty org", () => {
    const expected = planLoad(HUESOS_ROWS, new Set()).toCreate.map((p) => p.name);
    expect([...HUESOS_NAMES]).toEqual(expected);
    expect(HUESOS_NAMES).toHaveLength(36);
    expect(HUESOS_NAMES).toContain("HUESO CORBATA 3/4");
    expect(HUESOS_NAMES).not.toContain("ROLL 9/10");
  });
});

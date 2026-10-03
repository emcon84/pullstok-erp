import {
  buildDefaultChartRows,
  descendantIds,
  resolveAccountType,
  validateDeletion,
  validateParentCanHaveChildren,
  validatePostableChange,
  validateReparent,
} from "../../src/services/accountRules";

// a → b → c ; d suelta
const tree = [
  { id: "a", parentId: null },
  { id: "b", parentId: "a" },
  { id: "c", parentId: "b" },
  { id: "d", parentId: null },
];

describe("resolveAccountType", () => {
  it("hereda el tipo de la madre cuando no se pide uno", () => {
    expect(resolveAccountType({ type: "ASSET" }, undefined)).toEqual({ type: "ASSET" });
  });
  it("rechaza un tipo distinto al de la madre", () => {
    expect(resolveAccountType({ type: "ASSET" }, "INCOME").error).toMatch(/madre/);
  });
  it("sin madre exige tipo", () => {
    expect(resolveAccountType(null, undefined).error).toBeTruthy();
    expect(resolveAccountType(null, "EQUITY")).toEqual({ type: "EQUITY" });
  });
});

describe("imputables", () => {
  it("no permite subcuentas bajo una imputable", () => {
    expect(validateParentCanHaveChildren({ isPostable: true })).toBeTruthy();
    expect(validateParentCanHaveChildren({ isPostable: false })).toBeNull();
  });
  it("no permite pasar a imputable una cuenta con hijos", () => {
    expect(validatePostableChange(tree, "a", true)).toBeTruthy();
    expect(validatePostableChange(tree, "c", true)).toBeNull();
    expect(validatePostableChange(tree, "a", false)).toBeNull();
  });
});

describe("validateReparent", () => {
  it("detecta descendientes", () => {
    expect([...descendantIds(tree, "a")].sort()).toEqual(["b", "c"]);
  });
  it("rechaza moverse bajo sí misma o bajo un descendiente", () => {
    expect(validateReparent(tree, "a", "a")).toBeTruthy();
    expect(validateReparent(tree, "a", "c")).toBeTruthy();
  });
  it("permite mover a otra rama o a la raíz", () => {
    expect(validateReparent(tree, "b", "d")).toBeNull();
    expect(validateReparent(tree, "b", null)).toBeNull();
  });
});

describe("validateDeletion", () => {
  it("rechaza borrar con hijos y permite hojas", () => {
    expect(validateDeletion(tree, "a")).toBeTruthy();
    expect(validateDeletion(tree, "c")).toBeNull();
  });
});

describe("buildDefaultChartRows", () => {
  const rows = buildDefaultChartRows();
  it("tiene entre 40 y 60 cuentas, códigos únicos y padres existentes", () => {
    expect(rows.length).toBeGreaterThanOrEqual(40);
    expect(rows.length).toBeLessThanOrEqual(60);
    const codes = new Set(rows.map((r) => r.code));
    expect(codes.size).toBe(rows.length);
    rows.forEach((r) => r.parentCode && expect(codes.has(r.parentCode)).toBe(true));
  });
  it("hojas imputables, grupos no, tipo por rubro y padres antes que hijos", () => {
    const seen = new Set<string>();
    for (const r of rows) {
      if (r.parentCode) expect(seen.has(r.parentCode)).toBe(true);
      seen.add(r.code);
      const isParent = rows.some((x) => x.parentCode === r.code);
      expect(r.isPostable).toBe(!isParent);
    }
    expect(rows.find((r) => r.code === "1")?.type).toBe("ASSET");
    expect(rows.find((r) => r.code === "5.3.01")?.type).toBe("EXPENSE");
  });
});

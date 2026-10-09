import {
  type ImportAccountRow,
  validateImportRows,
  buildDefaultChartRows,
  descendantIds,
  resolveAccountType,
  validateDeletion,
  validateParentCanHaveChildren,
  validatePostableChange,
  validateReparent,
  shortCodeFromAccountingRef,
  planProviderRelinks,
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

describe("validateImportRows", () => {
  const row = (over: Partial<ImportAccountRow> & { code: string }): ImportAccountRow => ({
    name: over.code,
    type: "ASSET",
    parentCode: null,
    isPostable: false,
    ...over,
  });
  const valid: ImportAccountRow[] = [
    row({ code: "1" }),
    row({ code: "1.01", parentCode: "1" }),
    row({ code: "1.01.001", parentCode: "1.01" }),
    row({ code: "1.01.001.001.000", parentCode: "1.01.001", isPostable: true, shortCode: "1001" }),
    row({ code: "1.01.001.002.000", parentCode: "1.01.001", isPostable: true, shortCode: "1002" }),
  ];

  it("acepta un plan válido", () => {
    expect(validateImportRows(valid)).toBeNull();
  });
  it("rechaza códigos duplicados", () => {
    expect(validateImportRows([...valid, row({ code: "1.01", parentCode: "1" })])).toMatch(/duplicado: 1\.01/);
  });
  it("rechaza códigos cortos duplicados", () => {
    const rows = [...valid.slice(0, 4), row({ code: "1.01.001.002.000", parentCode: "1.01.001", isPostable: true, shortCode: "1001" })];
    expect(validateImportRows(rows)).toMatch(/corto duplicado: 1001/);
  });
  it("rechaza una madre inexistente", () => {
    expect(validateImportRows([row({ code: "1.01", parentCode: "1" })])).toMatch(/inexistente \(1\)/);
  });
  it("rechaza una madre imputable", () => {
    const rows = [row({ code: "1", isPostable: true }), row({ code: "1.01", parentCode: "1" })];
    expect(validateImportRows(rows)).toMatch(/madre 1 de 1\.01 no puede ser imputable/);
  });
  it("rechaza un tipo distinto al de la madre", () => {
    const rows = [row({ code: "1" }), row({ code: "1.01", parentCode: "1", type: "INCOME" })];
    expect(validateImportRows(rows)).toMatch(/mismo tipo.*1\.01|1\.01.*mismo tipo/);
  });
});

describe("shortCodeFromAccountingRef", () => {
  it("toma el primer token numérico", () => {
    expect(shortCodeFromAccountingRef("2001 Proveedores Varios")).toBe("2001");
    expect(shortCodeFromAccountingRef("  2500  Acreedores")).toBe("2500");
  });
  it("devuelve null sin código numérico o sin valor", () => {
    expect(shortCodeFromAccountingRef("Proveedores")).toBeNull();
    expect(shortCodeFromAccountingRef("")).toBeNull();
    expect(shortCodeFromAccountingRef(null)).toBeNull();
    expect(shortCodeFromAccountingRef(undefined)).toBeNull();
  });
});

describe("planProviderRelinks", () => {
  const imported = [
    { shortCode: "2001", isPostable: true },
    { shortCode: "2500", isPostable: true },
    { shortCode: "2000", isPostable: false },
    { shortCode: null, isPostable: true },
  ];
  it("agrupa por shortCode usando accountingRef cuando no hay cuenta", () => {
    const plan = planProviderRelinks(
      [
        { id: "p1", accountingRef: "2001 Proveedores Varios", currentShortCode: null },
        { id: "p2", accountingRef: "2001 Proveedores Varios", currentShortCode: null },
        { id: "p3", accountingRef: "2500 Acreedores Varios", currentShortCode: null },
      ],
      imported,
    );
    expect(plan.get("2001")).toEqual(["p1", "p2"]);
    expect(plan.get("2500")).toEqual(["p3"]);
  });
  it("un proveedor vinculado conserva su cuenta por shortCode aunque accountingRef diga otra", () => {
    const plan = planProviderRelinks(
      [{ id: "p1", accountingRef: "2001 Proveedores Varios", currentShortCode: "2500" }],
      imported,
    );
    expect(plan.get("2500")).toEqual(["p1"]);
    expect(plan.has("2001")).toBe(false);
  });
  it("no vincula a cuentas no imputables, inexistentes ni sin shortCode", () => {
    const plan = planProviderRelinks(
      [
        { id: "p1", accountingRef: "2000 Madre", currentShortCode: null },
        { id: "p2", accountingRef: "9999 Otra", currentShortCode: null },
        { id: "p3", accountingRef: "Sin código", currentShortCode: null },
        { id: "p4", accountingRef: null, currentShortCode: null },
      ],
      imported,
    );
    expect(plan.size).toBe(0);
  });
});

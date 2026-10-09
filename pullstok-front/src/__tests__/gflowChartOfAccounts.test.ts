import { describe, it, expect } from "vitest";
import { parseGflowChartOfAccounts } from "../utils/gflowChartOfAccounts";

const blank = (n = 14) => Array(n).fill("");
const row = (cells: Record<number, unknown>) => {
  const r: unknown[] = blank();
  for (const [i, v] of Object.entries(cells)) r[Number(i)] = v;
  return r;
};
const chapter = (code: unknown, name: string) => row({ 0: "CAPITULO:", 3: code, 4: name });
const rubro = (code: unknown, name: string) => row({ 0: "RUBRO:", 3: code, 4: name });
const madre = (code: string, name: string) => row({ 0: "CTA.MADRE:", 2: code, 5: name });
const leaf = (ref: string, short: unknown, name: string, saldo: string) =>
  row({ 0: ref, 4: short, 5: name, 6: saldo, 7: "Si", 8: "Corrientes" });

const HEADER = row({ 0: "Ref. Contable", 3: "Cód.Corto", 5: "D E N O M I N A C I O N", 6: "Saldo" });

const fixture = (): unknown[][] => [
  row({ 0: "Plan de Cuentas" }),
  blank(),
  row({ 0: "09/10/2026 10:15" }),
  HEADER,
  chapter(1, "ACTIVO"),
  rubro(101, "DISPONIBILIDADES"),
  madre("1.01.001", "CAJA"),
  leaf("1.01.001.001.000", 1001, "Caja", "Deudor"),
  row({ 0: "", 2: "Página", 3: 1, 4: "de", 5: 2 }),
  HEADER,
  leaf("1.01.001.002.000", "1002", 'Caja "chica", sucursal  ', "Deudor"),
  chapter("6", "OTROS INGRESOS Y EGRESOS"),
  rubro("601", "RESULTADOS VARIOS"),
  madre("6.01.001", "DIFERENCIAS"),
  leaf("6.01.001.001.000", 6001, "Diferencia de caja (+)", "Acreedor"),
  leaf("6.01.001.002.000", 6002, "Diferencia de caja (-)", "Deudor"),
  row({ 0: "# Items:", 1: 8 }),
];

describe("parseGflowChartOfAccounts", () => {
  it("ignora el ruido y mapea códigos, padres, tipos y saldos", () => {
    const { accounts, errors } = parseGflowChartOfAccounts(fixture());
    expect(errors).toEqual([]);
    expect(accounts.map((a) => a.code)).toEqual([
      "1", "1.01", "1.01.001", "1.01.001.001.000", "1.01.001.002.000",
      "6", "6.01", "6.01.001", "6.01.001.001.000", "6.01.001.002.000",
    ]);
    const by = Object.fromEntries(accounts.map((a) => [a.code, a]));
    expect(by["1"]).toMatchObject({ parentCode: null, type: "ASSET", isPostable: false, shortCode: null, normalBalance: null });
    expect(by["1.01"]).toMatchObject({ parentCode: "1", name: "DISPONIBILIDADES", isPostable: false });
    expect(by["1.01.001"]).toMatchObject({ parentCode: "1.01", name: "CAJA", type: "ASSET" });
    expect(by["1.01.001.001.000"]).toMatchObject({
      parentCode: "1.01.001", shortCode: "1001", isPostable: true, normalBalance: "DEBIT", type: "ASSET",
    });
    expect(by["1.01.001.002.000"]).toMatchObject({ name: 'Caja "chica", sucursal', shortCode: "1002" });
  });

  it("clasifica el capítulo 6 como EXPENSE y conserva la naturaleza por cuenta", () => {
    const { accounts } = parseGflowChartOfAccounts(fixture());
    const six = accounts.filter((a) => a.code.startsWith("6"));
    expect(six.every((a) => a.type === "EXPENSE")).toBe(true);
    expect(accounts.find((a) => a.code === "6.01.001.001.000")?.normalBalance).toBe("CREDIT");
    expect(accounts.find((a) => a.code === "6.01.001.002.000")?.normalBalance).toBe("DEBIT");
  });

  it("reporta una hoja sin cuenta madre", () => {
    const { errors } = parseGflowChartOfAccounts([chapter(1, "ACTIVO"), leaf("1.01.009.001.000", 1, "Huérfana", "Deudor")]);
    expect(errors).toEqual(["La cuenta 1.01.009.001.000 no tiene cuenta madre (1.01.009)"]);
  });

  it("reporta capítulo desconocido, código duplicado y saldo inválido", () => {
    const rows = [
      chapter(1, "ACTIVO"),
      rubro(101, "DISP"),
      madre("1.01.001", "CAJA"),
      leaf("1.01.001.001.000", 1, "A", "Deudor"),
      leaf("1.01.001.001.000", 2, "B", "Deudor"),
      leaf("1.01.001.003.000", 3, "C", "Otro"),
      chapter(9, "RARO"),
    ];
    const { errors } = parseGflowChartOfAccounts(rows);
    expect(errors).toContain("Código duplicado: 1.01.001.001.000");
    expect(errors).toContain('Saldo inválido en la cuenta 1.01.001.003.000: "Otro"');
    expect(errors).toContain('Capítulo desconocido "9" (cuenta 9)');
  });
});

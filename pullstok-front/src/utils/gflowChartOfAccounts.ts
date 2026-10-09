import * as XLSX from "xlsx";
import type { AccountType, ImportAccountRow } from "../services/accounts";

// Parser del plan de cuentas exportado por GFLOW (sistema legado del cliente).
// El .xls es un *reporte* (no una tabla plana): títulos, marcas de página y
// encabezados repetidos se ignoran; solo importan las filas CAPITULO / RUBRO /
// CTA.MADRE y las hojas (referencia contable "d.dd.ddd.ddd.ddd").

export interface GflowParseResult {
  accounts: ImportAccountRow[];
  errors: string[];
}

// El capítulo 6 (otros ingresos y egresos) es mixto: se clasifica como sección
// de resultados (EXPENSE) y la naturaleza por cuenta queda en normalBalance.
const TYPE_BY_CHAPTER: Record<string, AccountType> = {
  "1": "ASSET",
  "2": "LIABILITY",
  "3": "EQUITY",
  "4": "INCOME",
  "5": "EXPENSE",
  "6": "EXPENSE",
};

const LEAF_REF = /^\d\.\d{2}\.\d{3}\.\d{3}\.\d{3}$/;

const text = (v: unknown) => String(v ?? "").trim();

export const parseGflowChartOfAccounts = (rows: unknown[][]): GflowParseResult => {
  const accounts: ImportAccountRow[] = [];
  const errors: string[] = [];
  const codes = new Set<string>();
  const reportedChapters = new Set<string>();

  const add = (row: ImportAccountRow): boolean => {
    const chapter = row.code.charAt(0);
    if (!TYPE_BY_CHAPTER[chapter]) {
      if (!reportedChapters.has(chapter)) {
        reportedChapters.add(chapter);
        errors.push(`Capítulo desconocido "${chapter}" (cuenta ${row.code})`);
      }
      return false;
    }
    if (codes.has(row.code)) {
      errors.push(`Código duplicado: ${row.code}`);
      return false;
    }
    codes.add(row.code);
    accounts.push(row);
    return true;
  };

  for (const r of rows) {
    const label = text(r[0]);

    if (label === "CAPITULO:") {
      const code = text(r[3]);
      const name = text(r[4]);
      if (!code || !name) continue;
      add({
        code,
        shortCode: null,
        name,
        type: TYPE_BY_CHAPTER[code] ?? "ASSET",
        parentCode: null,
        isPostable: false,
        normalBalance: null,
      });
    } else if (label === "RUBRO:") {
      const raw = text(r[3]);
      const name = text(r[4]);
      if (!raw || !name) continue;
      if (!/^\d{3}$/.test(raw)) {
        errors.push(`Rubro con código inválido: "${raw}" (${name})`);
        continue;
      }
      const code = `${raw.charAt(0)}.${raw.slice(1)}`;
      add({
        code,
        shortCode: null,
        name,
        type: TYPE_BY_CHAPTER[raw.charAt(0)] ?? "ASSET",
        parentCode: raw.charAt(0),
        isPostable: false,
        normalBalance: null,
      });
    } else if (label === "CTA.MADRE:") {
      const code = text(r[2]);
      const name = text(r[5]);
      if (!code || !name) continue;
      add({
        code,
        shortCode: null,
        name,
        type: TYPE_BY_CHAPTER[code.charAt(0)] ?? "ASSET",
        parentCode: code.slice(0, 4),
        isPostable: false,
        normalBalance: null,
      });
    } else if (LEAF_REF.test(label)) {
      const parentCode = label.slice(0, 8);
      // La madre siempre precede a sus hojas en el reporte. Un capítulo desconocido
      // ya se reportó: no se suma un error en cascada por cada hoja.
      if (TYPE_BY_CHAPTER[label.charAt(0)] && !codes.has(parentCode)) {
        errors.push(`La cuenta ${label} no tiene cuenta madre (${parentCode})`);
        continue;
      }
      const saldo = text(r[6]);
      const normalBalance =
        saldo === "Deudor" ? "DEBIT" : saldo === "Acreedor" ? "CREDIT" : null;
      if (!normalBalance) {
        errors.push(`Saldo inválido en la cuenta ${label}: "${saldo}"`);
        continue;
      }
      add({
        code: label,
        shortCode: text(r[4]) || null,
        name: text(r[5]),
        type: TYPE_BY_CHAPTER[label.charAt(0)] ?? "ASSET",
        parentCode,
        isPostable: true,
        normalBalance,
      });
    }
  }

  // Cada madre debe existir (hoja sin madre, madre sin rubro, rubro sin capítulo).
  const known = new Set(accounts.map((a) => a.code));
  for (const a of accounts) {
    if (a.parentCode && !known.has(a.parentCode)) {
      errors.push(`La cuenta ${a.code} no tiene cuenta madre (${a.parentCode})`);
    }
  }
  return { accounts, errors };
};

/** Lee el archivo (primera hoja) y lo pasa por el parser. */
export const readGflowFile = async (file: File): Promise<GflowParseResult> => {
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return { accounts: [], errors: ["El archivo no tiene hojas"] };
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  return parseGflowChartOfAccounts(rows);
};

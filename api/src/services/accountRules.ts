import type { AccountType } from "@prisma/client";
import { DEFAULT_CHART_OF_ACCOUNTS, ROOT_TYPE_BY_DIGIT } from "../config/defaultChartOfAccounts";

// Reglas de negocio del plan de cuentas, puras (sin DB) para poder testearlas.
// Cada validador devuelve el mensaje de error (en español) o null si es válido;
// el controller lo traduce a 400/409.

export interface AccountNode {
  id: string;
  parentId: string | null;
  type: AccountType;
  isPostable: boolean;
}

/** Ids de todos los descendientes (hijos, nietos…) de `id`. */
export const descendantIds = (accounts: Pick<AccountNode, "id" | "parentId">[], id: string): Set<string> => {
  const byParent = new Map<string, string[]>();
  for (const a of accounts) {
    if (!a.parentId) continue;
    byParent.set(a.parentId, [...(byParent.get(a.parentId) ?? []), a.id]);
  }
  const result = new Set<string>();
  const stack = [...(byParent.get(id) ?? [])];
  while (stack.length) {
    const current = stack.pop() as string;
    if (result.has(current)) continue;
    result.add(current);
    stack.push(...(byParent.get(current) ?? []));
  }
  return result;
};

export const hasChildren = (accounts: Pick<AccountNode, "id" | "parentId">[], id: string) =>
  accounts.some((a) => a.parentId === id);

/** Tipo efectivo: con madre hereda su tipo; sin madre exige uno explícito. */
export const resolveAccountType = (
  parent: Pick<AccountNode, "type"> | null,
  requested: AccountType | undefined,
): { type?: AccountType; error?: string } => {
  if (parent) {
    if (requested && requested !== parent.type) {
      return { error: "El tipo de la cuenta debe coincidir con el de su cuenta madre" };
    }
    return { type: parent.type };
  }
  if (!requested) return { error: "El tipo de cuenta es requerido" };
  return { type: requested };
};

/** La madre no puede ser imputable (las imputables son hojas). */
export const validateParentCanHaveChildren = (parent: Pick<AccountNode, "isPostable">): string | null =>
  parent.isPostable ? "No se pueden crear subcuentas bajo una cuenta imputable" : null;

/** Una cuenta con hijos no puede pasar a imputable. */
export const validatePostableChange = (
  accounts: Pick<AccountNode, "id" | "parentId">[],
  id: string,
  isPostable: boolean,
): string | null =>
  isPostable && hasChildren(accounts, id)
    ? "Una cuenta con subcuentas no puede ser imputable"
    : null;

/** Mover `id` bajo `newParentId` no debe crear un ciclo. */
export const validateReparent = (
  accounts: Pick<AccountNode, "id" | "parentId">[],
  id: string,
  newParentId: string | null,
): string | null => {
  if (!newParentId) return null;
  if (newParentId === id) return "Una cuenta no puede ser su propia cuenta madre";
  if (descendantIds(accounts, id).has(newParentId)) {
    return "Una cuenta no puede moverse bajo una de sus subcuentas";
  }
  return null;
};

/** No se puede borrar una cuenta con subcuentas. */
export const validateDeletion = (
  accounts: Pick<AccountNode, "id" | "parentId">[],
  id: string,
): string | null =>
  hasChildren(accounts, id) ? "No se puede eliminar una cuenta que tiene subcuentas" : null;

export interface SeedAccountRow {
  code: string;
  name: string;
  type: AccountType;
  parentCode: string | null;
  isPostable: boolean;
}

/** Expande el plan base: padre por prefijo del código, tipo por rubro, hojas imputables. */
export const buildDefaultChartRows = (): SeedAccountRow[] => {
  const codes = new Set(DEFAULT_CHART_OF_ACCOUNTS.map((a) => a.code));
  const parents = new Set<string>();
  const rows = DEFAULT_CHART_OF_ACCOUNTS.map((a) => {
    const parts = a.code.split(".");
    const parentCode = parts.length > 1 ? parts.slice(0, -1).join(".") : null;
    if (parentCode) parents.add(parentCode);
    return { ...a, parentCode };
  });
  return rows.map((r) => {
    if (r.parentCode && !codes.has(r.parentCode)) {
      throw new Error(`Plan base inválido: falta la cuenta madre ${r.parentCode}`);
    }
    return {
      code: r.code,
      name: r.name,
      type: ROOT_TYPE_BY_DIGIT[r.code.split(".")[0]],
      parentCode: r.parentCode,
      isPostable: !parents.has(r.code),
    };
  });
};

export interface ImportAccountRow extends SeedAccountRow {
  shortCode?: string | null;
  normalBalance?: "DEBIT" | "CREDIT" | null;
}

/**
 * Valida un plan importado (p. ej. de GFLOW) antes de reemplazar el actual:
 * códigos y códigos cortos únicos, madres presentes en el payload y no
 * imputables, mismo tipo que la madre, y raíces sin madre.
 */
export const validateImportRows = (rows: ImportAccountRow[]): string | null => {
  const byCode = new Map<string, ImportAccountRow>();
  const shortCodes = new Set<string>();
  for (const r of rows) {
    if (byCode.has(r.code)) return `Código duplicado: ${r.code}`;
    byCode.set(r.code, r);
    if (r.shortCode) {
      if (shortCodes.has(r.shortCode)) {
        return `Código corto duplicado: ${r.shortCode} (cuenta ${r.code})`;
      }
      shortCodes.add(r.shortCode);
    }
  }
  for (const r of rows) {
    if (r.parentCode === null) continue;
    const parent = byCode.get(r.parentCode);
    if (!parent) return `La cuenta ${r.code} referencia una cuenta madre inexistente (${r.parentCode})`;
    if (parent.isPostable) {
      return `La cuenta madre ${parent.code} de ${r.code} no puede ser imputable`;
    }
    if (parent.type !== r.type) {
      return `La cuenta ${r.code} debe tener el mismo tipo que su cuenta madre ${parent.code}`;
    }
  }
  return null;
};

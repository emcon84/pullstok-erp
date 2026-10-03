import type { Account } from "../services/accounts";

export interface AccountRow {
  account: Account;
  depth: number;
  hasChildren: boolean;
}

const byCode = (a: Account, b: Account) =>
  a.code.localeCompare(b.code, "es", { numeric: true });

/** Hijos directos por id de madre ("" = raíces), ordenados por código. */
export const childrenMap = (accounts: Account[]): Map<string, Account[]> => {
  const ids = new Set(accounts.map((a) => a.id));
  const map = new Map<string, Account[]>();
  for (const a of [...accounts].sort(byCode)) {
    // Una madre fuera de la lista (no debería pasar) se trata como raíz.
    const key = a.parentId && ids.has(a.parentId) ? a.parentId : "";
    map.set(key, [...(map.get(key) ?? []), a]);
  }
  return map;
};

/** Ids de la cuenta y todos sus descendientes. */
export const subtreeIds = (accounts: Account[], id: string): Set<string> => {
  const children = childrenMap(accounts);
  const result = new Set<string>([id]);
  const stack = [id];
  while (stack.length) {
    for (const c of children.get(stack.pop() as string) ?? []) {
      result.add(c.id);
      stack.push(c.id);
    }
  }
  return result;
};

/** Ids de las coincidencias de la búsqueda más todos sus ancestros. */
export const matchWithAncestors = (accounts: Account[], term: string): Set<string> => {
  const t = term.trim().toLowerCase();
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const result = new Set<string>();
  for (const a of accounts) {
    if (!a.code.toLowerCase().includes(t) && !a.name.toLowerCase().includes(t)) continue;
    let cur: Account | undefined = a;
    while (cur && !result.has(cur.id)) {
      result.add(cur.id);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
  }
  return result;
};

/**
 * Filas visibles del árbol en orden de pantalla. `only` restringe a un
 * conjunto de ids (búsqueda); un nodo solo muestra hijos si está en `expanded`.
 */
export const flattenTree = (
  accounts: Account[],
  expanded: Set<string>,
  only?: Set<string>,
): AccountRow[] => {
  const children = childrenMap(accounts);
  const rows: AccountRow[] = [];
  const walk = (parentKey: string, depth: number) => {
    for (const account of children.get(parentKey) ?? []) {
      if (only && !only.has(account.id)) continue;
      const kids = (children.get(account.id) ?? []).filter((c) => !only || only.has(c.id));
      rows.push({ account, depth, hasChildren: kids.length > 0 });
      if (kids.length > 0 && expanded.has(account.id)) walk(account.id, depth + 1);
    }
  };
  walk("", 0);
  return rows;
};

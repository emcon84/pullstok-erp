import type { NavItem } from "@/components/molecules/sidebar/navItems";

export type Role =
  | "SUPERADMIN"
  | "ADMIN"
  | "MANAGEMENT"
  | "VENDEDOR"
  | "CASHIER"
  | "EMPLOYEE";

/** Display names for each role in Spanish (UI). */
export const ROLE_DISPLAY: Record<Role, string> = {
  SUPERADMIN: "Superadmin",
  ADMIN: "Admin",
  MANAGEMENT: "Administración",
  VENDEDOR: "Vendedor",
  CASHIER: "Caja",
  EMPLOYEE: "Empleado",
};

/**
 * Role-visibility map: each sidebar path lists the roles that can see it.
 * EMPLOYEE only sees Dashboard; VENDEDOR sees sales + customers + quotations + orders.
 */
export const ROLE_VISIBLE_PATHS: Record<string, Role[]> = {
  "/dashboard": [
    "SUPERADMIN",
    "ADMIN",
    "MANAGEMENT",
    "VENDEDOR",
    "CASHIER",
    "EMPLOYEE",
  ],
  "/Ventas": ["ADMIN", "MANAGEMENT", "VENDEDOR", "CASHIER"],
  "/Clientes": ["ADMIN", "MANAGEMENT", "VENDEDOR"],
  "/presupuestos": ["ADMIN", "MANAGEMENT", "VENDEDOR"],
  "/pedidos": ["ADMIN", "MANAGEMENT", "VENDEDOR"],
  "/categorias": ["ADMIN", "MANAGEMENT"],
  "/facturas": ["ADMIN", "MANAGEMENT", "CASHIER"], // Remitos
  "/tienda": ["ADMIN", "MANAGEMENT"],
  "/mensajes": ["ADMIN", "MANAGEMENT"],
  "/facturacion": ["ADMIN", "MANAGEMENT"], // gated by plan too
  "/asistente-ia": ["ADMIN", "MANAGEMENT"], // gated by plan too
  "/usuarios": ["ADMIN", "MANAGEMENT"], // NEW — user management
};

/**
 * Returns true if the given role can access the given path.
 */
export function roleAllows(role: string, path: string): boolean {
  const allowed = ROLE_VISIBLE_PATHS[path];
  if (!allowed) return true; // unknown paths are visible by default
  return allowed.includes(role as Role);
}

/**
 * Filters nav items by the user's role. An item is visible if:
 * - it has no `visibleRoles` declared (default: visible to all), or
 * - the user's role is in `visibleRoles`.
 *
 * Composable with filterNavItemsByPlan via chaining.
 */
export function filterNavItemsByRole(
  items: NavItem[],
  role: string | null | undefined,
): NavItem[] {
  if (!role) return items; // no role resolved → show all (fail-open for sidebar)
  return items.filter((item) => {
    if (!item.visibleRoles) return true;
    return item.visibleRoles.includes(role as Role);
  });
}

/**
 * Roles that may edit the stock of ANY branch (spec A2).
 */
export const STOCK_EDIT_ROLES: Role[] = ["ADMIN", "MANAGEMENT"];

/**
 * Client-side stock-edit policy for the UI, mirroring the backend
 * stockService.canEditBranchStock (spec A2 / design D5): ADMIN/MANAGEMENT may
 * edit any branch; VENDEDOR/CASHIER only their assigned branches (null/empty =
 * read-only); everyone else never edits. The GET /products/:id/stock response
 * carries the authoritative per-branch `canEdit` computed from the DB; this
 * helper is the UI-level expression of the same rule.
 */
export function canEditBranchStock(
  role: string | null | undefined,
  branchIds: string[] | null | undefined,
  targetBranchId: string,
): boolean {
  if (role === "ADMIN" || role === "MANAGEMENT") return true;
  if (role === "VENDEDOR" || role === "CASHIER") {
    return Array.isArray(branchIds) && branchIds.includes(targetBranchId);
  }
  return false;
}

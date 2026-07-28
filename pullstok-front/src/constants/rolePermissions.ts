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

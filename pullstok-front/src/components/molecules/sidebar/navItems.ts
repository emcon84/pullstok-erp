import {
  LayoutDashboard,
  FileText,
  ClipboardList,
  ShoppingCart,
  Truck,
  Users,
  Store,
  Receipt,
  Tags,
  MessageSquare,
  Bot,
  UserPlus,
  Building,
  ScanLine,
} from "lucide-react";
import { PLAN_LIMITS, type Plan } from "@/constants/planLimits";
import type { Role } from "@/constants/rolePermissions";

export interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  // Clave de módulo a chequear contra PLAN_LIMITS[plan].modules. `null`/
  // `undefined` = sin gate, siempre visible.
  //
  // NOTA IMPORTANTE: PLAN_LIMITS[plan].modules (api/src/config/planLimits.ts)
  // hoy NO refleja el comportamiento real del sidebar para los módulos
  // preexistentes. Ej.: BASICO.modules = ["stock","ventas","clientes"], sin
  // "presupuestos"/"pedidos"/"remitos"/"tienda" — pero esos items SIEMPRE
  // se mostraron a todos los planes hasta ahora (ver discovery engram
  // #567). Aplicar el array literalmente a los items preexistentes
  // regresionaría funcionalidad visible hoy en BASICO. Por eso los items
  // preexistentes quedan con moduleKey: null (siempre visibles, sin
  // cambio de comportamiento) y SOLO "Facturación" (módulo nuevo, sin
  // usuarios actuales que dependan de verlo) usa gating real. Si en el
  // futuro se decide gatear los módulos preexistentes, hay que resolver
  // primero la inconsistencia entre planLimits.ts y el comportamiento
  // actual (decisión de producto, no técnica).
  moduleKey?: string | null;
  // Roles que pueden ver este item. `undefined` = visible para todos.
  visibleRoles?: Role[];
}

export const navItems: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, moduleKey: null, visibleRoles: ["SUPERADMIN", "ADMIN", "MANAGEMENT", "VENDEDOR", "CASHIER", "EMPLOYEE"] },
  { to: "/categorias", label: "Categorías", icon: Tags, moduleKey: null, visibleRoles: ["ADMIN", "MANAGEMENT"] },
  { to: "/presupuestos", label: "Presupuestos", icon: FileText, moduleKey: null, visibleRoles: ["ADMIN", "MANAGEMENT", "VENDEDOR"] },
  { to: "/pedidos", label: "Pedidos", icon: ClipboardList, moduleKey: null, visibleRoles: ["ADMIN", "MANAGEMENT", "VENDEDOR"] },
  { to: "/Ventas", label: "Ventas", icon: ShoppingCart, moduleKey: null, visibleRoles: ["ADMIN", "MANAGEMENT", "VENDEDOR", "CASHIER"] },
  { to: "/facturas", label: "Remitos", icon: Truck, moduleKey: null, visibleRoles: ["ADMIN", "MANAGEMENT", "CASHIER"] },
  { to: "/Clientes", label: "Clientes", icon: Users, moduleKey: null, visibleRoles: ["ADMIN", "MANAGEMENT", "VENDEDOR"] },
  { to: "/tienda", label: "Tienda", icon: Store, moduleKey: null, visibleRoles: ["ADMIN", "MANAGEMENT"] },
  { to: "/mensajes", label: "Mensajes", icon: MessageSquare, moduleKey: null, visibleRoles: ["ADMIN", "MANAGEMENT"] },
  { to: "/facturacion", label: "Facturación", icon: Receipt, moduleKey: "facturacion", visibleRoles: ["ADMIN", "MANAGEMENT"] },
  { to: "/asistente-ia", label: "Asistente IA", icon: Bot, moduleKey: "bot", visibleRoles: ["ADMIN", "MANAGEMENT"] },
  { to: "/usuarios", label: "Usuarios", icon: UserPlus, moduleKey: null, visibleRoles: ["ADMIN", "MANAGEMENT"] },
  { to: "/sucursales", label: "Sucursales", icon: Building, moduleKey: null, visibleRoles: ["ADMIN", "MANAGEMENT"] },
  { to: "/escaner", label: "Escaner", icon: ScanLine, moduleKey: null },
];

/**
 * Filtra navItems según el plan de la organización. Un item se muestra si:
 * - no tiene moduleKey (null/undefined), o
 * - su moduleKey está en PLAN_LIMITS[plan].modules.
 *
 * Si `plan` es null/undefined/desconocido, se asume "sin plan resuelto" y
 * se ocultan los items gateados (fail-closed) — no debería pasar en un
 * usuario autenticado normal, pero protege contra datos incompletos en
 * localStorage (ej. sesiones viejas sin el campo `plan`).
 */
export function filterNavItemsByPlan(
  items: NavItem[],
  plan: Plan | null | undefined,
): NavItem[] {
  return items.filter((item) => {
    if (!item.moduleKey) return true;
    const modules = plan ? PLAN_LIMITS[plan]?.modules : undefined;
    return !!modules?.includes(item.moduleKey);
  });
}

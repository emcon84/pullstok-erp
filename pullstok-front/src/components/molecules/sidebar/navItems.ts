import {
  LayoutDashboard,
  FileText,
  ClipboardList,
  ShoppingCart,
  Truck,
  Users,
  Store,
  Receipt,
} from "lucide-react";
import { PLAN_LIMITS, type Plan } from "@/constants/planLimits";

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
}

export const navItems: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, moduleKey: null },
  { to: "/presupuestos", label: "Presupuestos", icon: FileText, moduleKey: null },
  { to: "/pedidos", label: "Pedidos", icon: ClipboardList, moduleKey: null },
  { to: "/Ventas", label: "Ventas", icon: ShoppingCart, moduleKey: null },
  { to: "/facturas", label: "Remitos", icon: Truck, moduleKey: null },
  { to: "/Clientes", label: "Clientes", icon: Users, moduleKey: null },
  { to: "/tienda", label: "Tienda", icon: Store, moduleKey: null },
  { to: "/facturacion", label: "Facturación", icon: Receipt, moduleKey: "facturacion" },
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

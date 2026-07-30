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
  DollarSign,
  Package,
  Settings,
  Wrench,
} from "lucide-react";
import { PLAN_LIMITS, type Plan } from "@/constants/planLimits";
import type { Role } from "@/constants/rolePermissions";

export interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  moduleKey?: string | null;
  visibleRoles?: Role[];
}

export interface NavGroup {
  label: string;
  icon: typeof LayoutDashboard;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    label: "Productos",
    icon: Package,
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/categorias", label: "Categorías", icon: Tags, visibleRoles: ["ADMIN", "MANAGEMENT"] },
      { to: "/actualizar-precios", label: "Actualizar precios", icon: DollarSign, visibleRoles: ["ADMIN", "SUPERADMIN"] },
    ],
  },
  {
    label: "Ventas",
    icon: ShoppingCart,
    items: [
      { to: "/Ventas", label: "Ventas", icon: ShoppingCart, visibleRoles: ["ADMIN", "MANAGEMENT", "VENDEDOR", "CASHIER"] },
      { to: "/presupuestos", label: "Presupuestos", icon: FileText, visibleRoles: ["ADMIN", "MANAGEMENT", "VENDEDOR"] },
      { to: "/pedidos", label: "Pedidos", icon: ClipboardList, visibleRoles: ["ADMIN", "MANAGEMENT", "VENDEDOR"] },
      { to: "/facturas", label: "Remitos", icon: Truck, visibleRoles: ["ADMIN", "MANAGEMENT", "CASHIER"] },
      { to: "/Clientes", label: "Clientes", icon: Users, visibleRoles: ["ADMIN", "MANAGEMENT", "VENDEDOR"] },
    ],
  },
  {
    label: "Tienda",
    icon: Store,
    items: [
      { to: "/tienda", label: "Configuración", icon: Store, visibleRoles: ["ADMIN", "MANAGEMENT"] },
    ],
  },
  {
    label: "Admin",
    icon: Settings,
    items: [
      { to: "/facturacion", label: "Facturación", icon: Receipt, moduleKey: "facturacion", visibleRoles: ["ADMIN", "MANAGEMENT"] },
      { to: "/usuarios", label: "Usuarios", icon: UserPlus, visibleRoles: ["ADMIN", "MANAGEMENT"] },
      { to: "/sucursales", label: "Sucursales", icon: Building, visibleRoles: ["ADMIN", "MANAGEMENT"] },
      { to: "/mensajes", label: "Mensajes", icon: MessageSquare, visibleRoles: ["ADMIN", "MANAGEMENT"] },
    ],
  },
  {
    label: "Herramientas",
    icon: Wrench,
    items: [
      { to: "/scanner", label: "Scanner", icon: ScanLine },
      { to: "/asistente-ia", label: "Asistente IA", icon: Bot, moduleKey: "bot", visibleRoles: ["ADMIN", "MANAGEMENT"] },
    ],
  },
];

// Keep navItems flat for backward compatibility with filters
export const navItems: NavItem[] = navGroups.flatMap((g) => g.items);

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

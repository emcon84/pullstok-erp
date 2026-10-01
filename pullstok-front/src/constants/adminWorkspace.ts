import {
  Banknote,
  BookMarked,
  BookOpen,
  Boxes,
  Briefcase,
  Building,
  Calculator,
  CreditCard,
  Factory,
  HandCoins,
  Landmark,
  LayoutDashboard,
  Library,
  ListTree,
  type LucideIcon,
  Palette,
  Receipt,
  Scale,
  Settings,
  ShoppingBag,
  ShoppingCart,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import type { NavGroup } from "@/components/molecules/sidebar/navItems";
import { roleAllows, type Role } from "@/constants/rolePermissions";

/**
 * Espacio de trabajo ADMINISTRATIVO (Organization.uiMode = ADMINISTRATIVO):
 * fuente única de verdad del launcher (AdminHome) y del sidebar. Agrupado por
 * área; cada ítem declara si ya está implementado (`available`) y, si
 * corresponde, el módulo que lo habilita (`moduleKey`, ver MODULE_REGISTRY).
 *
 * Regla: ante la duda de que una pantalla exista, `available: false`.
 */
export interface AdminWorkspaceItem {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Ruta existente. Obligatoria para que un ítem esté disponible. */
  route?: string;
  /** Módulo que debe estar habilitado para la org; si falta se oculta. */
  moduleKey?: string;
  available: boolean;
  /** Override de roles; por defecto se usa roleAllows(role, route). */
  visibleRoles?: Role[];
}

export interface AdminWorkspaceArea {
  key: string;
  label: string;
  icon: LucideIcon;
  items: AdminWorkspaceItem[];
}

export const ADMIN_WORKSPACE_AREAS: AdminWorkspaceArea[] = [
  {
    key: "comercial",
    label: "Comercial",
    icon: Briefcase,
    items: [
      {
        key: "ventas",
        label: "Ventas",
        description: "Comprobantes y listado de ventas",
        icon: ShoppingCart,
        route: "/Ventas",
        available: true,
      },
      {
        key: "facturacion",
        label: "Facturación",
        description: "Facturas electrónicas ARCA",
        icon: Receipt,
        route: "/facturacion",
        moduleKey: "facturacion",
        available: true,
      },
      {
        key: "compras",
        label: "Compras",
        description: "Comprobantes de compra a proveedores",
        icon: ShoppingBag,
        available: false,
      },
      {
        key: "clientes",
        label: "Clientes",
        description: "Fichas y datos administrativos",
        icon: Users,
        route: "/Clientes",
        moduleKey: "clientes",
        available: true,
      },
      {
        key: "proveedores",
        label: "Proveedores",
        description: "Fichas y datos administrativos",
        icon: Factory,
        route: "/Proveedores",
        moduleKey: "proveedores",
        available: true,
      },
      {
        key: "stock",
        label: "Stock",
        description: "Productos y existencias",
        icon: Boxes,
        route: "/stock",
        moduleKey: "stock",
        available: true,
      },
    ],
  },
  {
    key: "tesoreria",
    label: "Tesorería",
    icon: Banknote,
    items: [
      {
        key: "caja",
        label: "Caja",
        description: "Sesiones y movimientos de caja",
        icon: Wallet,
        route: "/caja",
        available: true,
      },
      {
        // La cuenta corriente de clientes hoy es un diálogo dentro de
        // /Clientes, no una ruta propia → todavía no disponible.
        key: "cobranzas",
        label: "Cobranzas / Cta. cte. clientes",
        description: "Saldos y cobros de clientes",
        icon: HandCoins,
        available: false,
      },
      {
        key: "pagos",
        label: "Pagos / Cta. cte. proveedores",
        description: "Saldos y pagos a proveedores",
        icon: CreditCard,
        available: false,
      },
      {
        key: "bancos",
        label: "Bancos",
        description: "Cuentas y conciliación bancaria",
        icon: Landmark,
        available: false,
      },
    ],
  },
  {
    key: "contabilidad",
    label: "Contabilidad",
    icon: Calculator,
    items: [
      {
        key: "asientos",
        label: "Asientos",
        description: "Registro de asientos contables",
        icon: BookOpen,
        available: false,
      },
      {
        key: "mayores",
        label: "Mayores",
        description: "Mayor por cuenta",
        icon: Library,
        available: false,
      },
      {
        key: "sumas-saldos",
        label: "Sumas y Saldos",
        description: "Balance de comprobación",
        icon: Scale,
        available: false,
      },
      {
        key: "plan-cuentas",
        label: "Plan de cuentas",
        description: "Estructura de cuentas contables",
        icon: ListTree,
        available: false,
      },
      {
        key: "libros",
        label: "Libros (Diario / IVA)",
        description: "Libro diario y libros de IVA",
        icon: BookMarked,
        available: false,
      },
    ],
  },
];

/**
 * Entradas de configuración que la app necesita también en modo
 * ADMINISTRATIVO (solo sidebar, no se muestran en el launcher). Mismos roles
 * que en el sidebar operativo (navItems.ts).
 */
export const ADMIN_SETTINGS_ITEMS: AdminWorkspaceItem[] = [
  { key: "usuarios", label: "Usuarios", description: "", icon: UserPlus, route: "/usuarios", available: true, visibleRoles: ["ADMIN", "MANAGEMENT"] },
  { key: "sucursales", label: "Sucursales", description: "", icon: Building, route: "/sucursales", available: true, visibleRoles: ["ADMIN", "MANAGEMENT"] },
  { key: "ajustes", label: "Ajustes", description: "", icon: Palette, route: "/ajustes", moduleKey: "branding", available: true, visibleRoles: ["ADMIN"] },
  { key: "modulos", label: "Módulos", description: "", icon: Settings, route: "/ajustes/modulos", available: true, visibleRoles: ["ADMIN"] },
];

/** Ruta del home (en modo ADMINISTRATIVO renderiza AdminHome). */
export const ADMIN_HOME_ROUTE = "/dashboard";

const isEnabled = (item: AdminWorkspaceItem, effectiveModules: string[]) =>
  !item.moduleKey || effectiveModules.includes(item.moduleKey);

const roleCanSee = (item: AdminWorkspaceItem, role: string | null | undefined) => {
  if (!role) return true; // sin rol resuelto → fail-open (igual que el sidebar)
  if (item.visibleRoles) return item.visibleRoles.includes(role as Role);
  // Ítems sin ruta (próximamente) no tienen permiso que evaluar.
  return item.route ? roleAllows(role, item.route) : true;
};

/** Un ítem es navegable solo si está marcado disponible Y tiene ruta. */
export const isItemAvailable = (item: AdminWorkspaceItem) =>
  item.available && !!item.route;

/**
 * Áreas visibles para la org/rol: oculta ítems cuyo módulo no está habilitado
 * o que el rol no puede ver (permisos de rolePermissions encima del gating por
 * módulo) y descarta áreas que quedan vacías. Los ítems no disponibles se
 * conservan (el launcher los muestra deshabilitados con "Próximamente").
 */
export function filterAdminWorkspace(
  areas: AdminWorkspaceArea[],
  effectiveModules: string[],
  role: string | null | undefined,
): AdminWorkspaceArea[] {
  return areas
    .map((area) => ({
      ...area,
      items: area.items.filter(
        (item) => isEnabled(item, effectiveModules) && roleCanSee(item, role),
      ),
    }))
    .filter((area) => area.items.length > 0);
}

/**
 * Sidebar ADMINISTRATIVO: mismas áreas que el launcher pero solo con ítems
 * disponibles (los "Próximamente" viven únicamente en el launcher para no
 * llenar el menú de links muertos), más "Inicio" y un grupo final de
 * configuración.
 */
export function buildAdminNavGroups(
  effectiveModules: string[],
  role: string | null | undefined,
): NavGroup[] {
  const groups: NavGroup[] = [
    {
      label: "Inicio",
      icon: LayoutDashboard,
      flat: true,
      items: [{ to: ADMIN_HOME_ROUTE, label: "Inicio", icon: LayoutDashboard }],
    },
  ];

  for (const area of filterAdminWorkspace(ADMIN_WORKSPACE_AREAS, effectiveModules, role)) {
    const items = area.items.filter(isItemAvailable).map((i) => ({
      to: i.route as string,
      label: i.label,
      icon: i.icon,
    }));
    if (items.length > 0) groups.push({ label: area.label, icon: area.icon, items });
  }

  const settings = ADMIN_SETTINGS_ITEMS.filter(
    (i) => isEnabled(i, effectiveModules) && roleCanSee(i, role),
  ).map((i) => ({ to: i.route as string, label: i.label, icon: i.icon }));
  if (settings.length > 0) {
    groups.push({ label: "Configuración", icon: Settings, items: settings });
  }
  return groups;
}

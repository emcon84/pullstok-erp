import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  FileText,
  ClipboardList,
  ShoppingCart,
  Truck,
  Users,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { logout } from "../../../controllers/authController";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/presupuestos", label: "Presupuestos", icon: FileText },
  { to: "/pedidos", label: "Pedidos", icon: ClipboardList },
  { to: "/Ventas", label: "Ventas", icon: ShoppingCart },
  { to: "/facturas", label: "Remitos", icon: Truck },
  { to: "/Clientes", label: "Clientes", icon: Users },
];

interface SidebarContentProps {
  onNavigate?: () => void;
}

export const SidebarContent = ({ onNavigate }: SidebarContentProps) => {
  const user = (() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  })();

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Marca */}
      <div className="flex h-16 items-center gap-2 border-b px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
          N
        </div>
        <span className="text-lg font-semibold tracking-tight">Nexo</span>
      </div>

      {/* Navegación */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Usuario + salir */}
      <div className="border-t p-3">
        {user && (
          <div className="mb-2 flex items-center gap-3 rounded-lg px-3 py-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold uppercase text-accent-foreground">
              {user.email?.[0] ?? "U"}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{user.email}</p>
              <p className="text-xs capitalize text-muted-foreground">
                {String(user.role ?? "").toLowerCase()}
              </p>
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground"
          onClick={() => logout()}
        >
          <LogOut className="h-4 w-4" />
          Salir
        </Button>
      </div>
    </div>
  );
};

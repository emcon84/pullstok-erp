import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, ShoppingCart, ScanLine, ClipboardList, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/dashboard", label: "Inicio", icon: LayoutDashboard },
  { to: "/Ventas", label: "Ventas", icon: ShoppingCart },
  { to: "/scanner", label: "Escanear", icon: ScanLine, primary: true },
  { to: "/pedidos", label: "Pedidos", icon: ClipboardList },
  { to: "/Clientes", label: "Clientes", icon: Users },
];

export const BottomBar = () => {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden border-t bg-background safe-area-bottom">
      <div className="flex items-center justify-around h-16">
        {items.map((item) => {
          const isActive = location.pathname === item.to || location.pathname.startsWith(item.to + "/");
          const Icon = item.icon;

          if (item.primary) {
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className="flex flex-col items-center justify-center -mt-5"
              >
                <div
                  className={cn(
                    "flex items-center justify-center w-14 h-14 rounded-full shadow-lg transition-transform active:scale-95",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "bg-primary text-primary-foreground",
                  )}
                >
                  <Icon className="h-6 w-6" />
                </div>
                <span className="text-[10px] font-medium mt-1 text-muted-foreground">
                  {item.label}
                </span>
              </NavLink>
            );
          }

          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 px-1 min-w-0 transition-colors",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground",
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium leading-tight truncate max-w-[64px] text-center">
                {item.label}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};

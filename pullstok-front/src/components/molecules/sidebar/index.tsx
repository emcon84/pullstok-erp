import { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { LogOut, ChevronDown, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { logout } from "../../../controllers/authController";
import { navGroups, filterNavItemsByPlan } from "./navItems";
import { filterNavItemsByRole } from "@/constants/rolePermissions";
import { usePendingOrdersCount } from "../../hooks/useOrder";
import { useUnreadMessagesCount } from "../../hooks/useChat";
import { useTheme } from "@/hooks/useTheme";
import { useBrandingContext } from "@/contexts/BrandingContext";
import { BrandLogo } from "@/components/atoms/BrandLogo";
import { InstallButton } from "@/components/atoms/InstallButton";
import { RefreshDataButton } from "@/components/atoms/RefreshDataButton";

interface SidebarContentProps {
  onNavigate?: () => void;
}

export const SidebarContent = ({ onNavigate }: SidebarContentProps) => {
  const location = useLocation();
  const { count: pendingOrders } = usePendingOrdersCount();
  const { count: unreadMessages } = useUnreadMessagesCount();
  const { theme, toggleTheme } = useTheme();

  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  const user = (() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  })();

  // Auto-open group containing the current route
  useEffect(() => {
    const currentPath = location.pathname;
    for (const group of navGroups) {
      const visibleItems = filterNavItemsByRole(
        filterNavItemsByPlan(group.items, user?.plan),
        user?.role,
      );
      if (visibleItems.some((item) => currentPath === item.to || currentPath.startsWith(item.to + "/"))) {
        setOpenGroups((prev) => new Set(prev).add(group.label));
        break;
      }
    }
  }, [location.pathname]);

  const toggleGroup = (label: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const { branding } = useBrandingContext();

  const badgeCount = (to: string) => {
    if (to === "/pedidos" && pendingOrders > 0) return pendingOrders;
    if (to === "/mensajes" && unreadMessages > 0) return unreadMessages;
    return 0;
  };

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Marca */}
      <div className="flex h-16 items-center gap-2 border-b px-4">
        <BrandLogo
          logoUrl={branding.logoUrl}
          displayName={branding.displayName}
          size="sidebar"
        />
        {branding.showDisplayName !== false && (
          <span
            className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight"
            title={branding.displayName || undefined}
          >
            {branding.displayName || "Pullstok"}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={toggleTheme}
            title={theme === "dark" ? "Modo claro" : "Modo oscuro"}
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>
          <RefreshDataButton className="h-8 w-8" />
        </div>
      </div>

      {/* Navegación por grupos */}
      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
        {navGroups.map((group) => {
          const visibleItems = filterNavItemsByRole(
            filterNavItemsByPlan(group.items, user?.plan),
            user?.role,
          );
          if (visibleItems.length === 0) return null;

          const isOpen = openGroups.has(group.label);
          const GroupIcon = group.icon;

          return (
            <div key={group.label}>
              <button
                onClick={() => toggleGroup(group.label)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
              >
                <GroupIcon className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">{group.label}</span>
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 transition-transform",
                    isOpen && "rotate-180",
                  )}
                />
              </button>

              <div
                className={cn(
                  "space-y-1 overflow-hidden transition-all",
                  isOpen ? "mt-1 max-h-96 opacity-100" : "max-h-0 opacity-0",
                )}
              >
                {visibleItems.map(({ to, label, icon: Icon }) => {
                  const count = badgeCount(to);
                  return (
                    <NavLink
                      key={to}
                      to={to}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2 pl-9 text-sm font-medium transition-colors",
                          isActive
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        )
                      }
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {label}
                      {count > 0 && (
                        <Badge
                          variant="destructive"
                          className="ml-auto h-5 min-w-5 px-1.5 text-xs"
                        >
                          {count}
                        </Badge>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Usuario + salir */}
      <div className="border-t p-3">
        {user && (
          <div className="mb-2 flex items-center gap-3 rounded-lg px-3 py-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold uppercase text-accent-foreground">
              {(user.name?.[0] || user.email?.[0] || user.username?.[0] || "U").toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{user.name || user.username || user.email}</p>
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
        <InstallButton />
      </div>
    </div>
  );
};

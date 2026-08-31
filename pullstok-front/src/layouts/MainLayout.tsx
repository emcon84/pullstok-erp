import { ReactNode, useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SidebarContent } from "../components/molecules/sidebar";
import { BottomBar } from "../components/molecules/BottomBar";
import { useBrandingContext } from "@/contexts/BrandingContext";
import { BrandLogo } from "@/components/atoms/BrandLogo";
import { RefreshDataButton } from "@/components/atoms/RefreshDataButton";
import { cn } from "@/lib/utils";

const SIDEBAR_COLLAPSED_KEY = "pullstok-sidebar-collapsed";

const MainLayout = ({ children }: { children: ReactNode }) => {
  const [open, setOpen] = useState(false);
  const { branding } = useBrandingContext();
  // Estado COLAPSADO (desktop): al encoger la sidebar a un riel de iconos el
  // contenido (lista de productos del vendedor/admin) gana ~192px de ancho.
  // Se persiste en localStorage para que sobreviva a recargas y navegación.
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1",
  );

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Sidebar fijo (desktop), colapsable a riel de iconos */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden border-r transition-all lg:block",
          collapsed ? "w-16" : "w-64",
        )}
      >
        <SidebarContent collapsed={collapsed} onToggle={toggleCollapsed} />
      </aside>

      {/* Header mobile con menú */}
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur lg:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0">
            <SheetTitle className="sr-only">Menú de navegación</SheetTitle>
            <SidebarContent onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
        <div className="flex min-w-0 items-center gap-2">
          <BrandLogo
            logoUrl={branding.logoUrl}
            displayName={branding.displayName}
            size="mobile"
          />
          {branding.showDisplayName !== false && (
            <span
              className="truncate font-semibold"
              title={branding.displayName || undefined}
            >
              {branding.displayName || "Pullstok"}
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <RefreshDataButton />
        </div>
      </header>

      {/* Contenido */}
      <main
        className={cn(
          "pb-20 transition-[padding] lg:pb-0",
          collapsed ? "lg:pl-16" : "lg:pl-64",
        )}
      >
        <div className="p-4 sm:p-6 lg:p-8">{children}</div>
      </main>

      {/* Bottom bar mobile */}
      <BottomBar />
    </div>
  );
};

export default MainLayout;

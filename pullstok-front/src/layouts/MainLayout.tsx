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

const MainLayout = ({ children }: { children: ReactNode }) => {
  const [open, setOpen] = useState(false);
  const { branding } = useBrandingContext();

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Sidebar fijo (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r lg:block">
        <SidebarContent />
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
        <div className="flex items-center gap-2">
          <BrandLogo
            logoUrl={branding.logoUrl}
            displayName={branding.displayName}
            size="mobile"
          />
          <span className="font-semibold">
            {branding.displayName || "Pullstok"}
          </span>
        </div>
      </header>

      {/* Contenido */}
      <main className="lg:pl-64 pb-20 lg:pb-0">
        <div className="p-4 sm:p-6 lg:p-8">{children}</div>
      </main>

      {/* Bottom bar mobile */}
      <BottomBar />
    </div>
  );
};

export default MainLayout;

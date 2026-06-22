import { Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate, Outlet } from "react-router-dom";
import { LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Loader } from "../components/atoms/loader";
import { getMe } from "../services/onboardingService";
import { logout } from "../controllers/authController";

/**
 * Layout del panel superadmin (sdd/planes-y-billing, Fase 6). Análogo a
 * ProtectedLayout pero con guard de rol en vez de guards de onboarding: solo
 * SUPERADMIN entra. Cualquier otro rol autenticado se redirige a /dashboard
 * (no tiene sentido mandarlo a login si ya tiene sesión válida, solo no le
 * corresponde este panel). Sin sidebar de la app normal — header propio,
 * mínimo, para diferenciar visualmente "estás en el panel de plataforma".
 */
const SuperadminLayout = () => {
  const isAuthenticated = !!localStorage.getItem("token");

  const { data: me, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
    enabled: isAuthenticated,
  });

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  if (isLoading || !me) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader />
      </div>
    );
  }

  if (me.role !== "SUPERADMIN") {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background px-4 sm:px-8">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-none">
              Panel Superadmin
            </p>
            <p className="text-xs leading-none text-muted-foreground">
              Pullstok · Plataforma
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-muted-foreground hover:text-foreground"
          onClick={() => logout()}
        >
          <LogOut className="h-4 w-4" />
          Salir
        </Button>
      </header>

      <main className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
        <Suspense
          fallback={
            <div className="flex min-h-[60vh] items-center justify-center">
              <Loader />
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
};

export default SuperadminLayout;

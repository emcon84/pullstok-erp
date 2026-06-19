import { Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate, Outlet } from "react-router-dom";
import MainLayout from "./MainLayout";
import { Loader } from "../components/atoms/loader";
import { getMe } from "../services/onboardingService";

/**
 * Layout persistente para las rutas autenticadas. El MainLayout (sidebar) se
 * monta UNA vez y permanece; solo el contenido (Outlet) hace Suspense al
 * cargar el chunk de cada vista. Así navegar no "parpadea" toda la pantalla.
 *
 * Cascada de gates (en este orden): sin token -> login; mustChangePassword
 * -> /cambiar-contrasena; sin onboarding completo -> /bienvenida; si no,
 * Outlet normal. ['me'] es la fuente de verdad server-side, reemplaza el
 * check sync anterior que solo miraba el token.
 */
const ProtectedLayout = () => {
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

  if (me.mustChangePassword) {
    return <Navigate to="/cambiar-contrasena" replace />;
  }

  // El wizard es ADMIN-only: un EMPLOYEE nunca lo ve, sin importar el estado
  // de onboarding de su organización (spec: sdd/onboarding-wizard/spec).
  if (me.role === "ADMIN" && !me.organization.onboardingCompletedAt) {
    return <Navigate to="/bienvenida" replace />;
  }

  return (
    <MainLayout>
      <Suspense
        fallback={
          <div className="flex min-h-[60vh] items-center justify-center">
            <Loader />
          </div>
        }
      >
        <Outlet />
      </Suspense>
    </MainLayout>
  );
};

export default ProtectedLayout;

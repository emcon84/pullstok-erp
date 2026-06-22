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
 * -> /cambiar-contrasena; organización suspendida -> /organizacion-suspendida;
 * sin onboarding completo -> /bienvenida; si no, Outlet normal. ['me'] es la
 * fuente de verdad server-side, reemplaza el check sync anterior que solo
 * miraba el token.
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

  // El SUPERADMIN no pertenece a ninguna organización (organizationId null):
  // su lugar es el panel de plataforma, no el dashboard org-scoped, que
  // dispararía endpoints que el multi-tenant bloquea por falta de contexto de
  // organización (500). Lo redirigimos al panel ANTES de montar MainLayout.
  if (me.role === "SUPERADMIN") {
    return <Navigate to="/superadmin/organizaciones" replace />;
  }

  if (me.mustChangePassword) {
    return <Navigate to="/cambiar-contrasena" replace />;
  }

  // Org suspendida (kill switch, sdd/planes-y-billing): a esta altura el rol
  // ya es ADMIN o EMPLOYEE (el SUPERADMIN se redirigió arriba), así que basta
  // con mirar el estado de la organización. `isActive` es opcional porque el
  // backend de getMe podría no exponerlo en todos los casos — undefined se
  // trata como activo, solo bloquea si llega explícitamente en false.
  if (me.organization.isActive === false) {
    return <Navigate to="/organizacion-suspendida" replace />;
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

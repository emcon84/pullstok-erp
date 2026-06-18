import { Suspense } from "react";
import { Navigate, Outlet } from "react-router-dom";
import MainLayout from "./MainLayout";
import { Loader } from "../components/atoms/loader";

/**
 * Layout persistente para las rutas autenticadas. El MainLayout (sidebar) se
 * monta UNA vez y permanece; solo el contenido (Outlet) hace Suspense al
 * cargar el chunk de cada vista. Así navegar no "parpadea" toda la pantalla.
 */
const ProtectedLayout = () => {
  const isAuthenticated = !!localStorage.getItem("token");
  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
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

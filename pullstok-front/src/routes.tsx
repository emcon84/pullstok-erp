import { Suspense, lazy } from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import AuthLayout from "./layouts/AuthLayout";
import ProtectedLayout from "./layouts/ProtectedLayout";
import OnboardingLayout from "./layouts/OnboardingLayout";
import SuperadminLayout from "./layouts/SuperadminLayout";
import { Loader } from "./components/atoms/loader";

const LoginPage = lazy(() =>
  import("./views/LoginPage").then((m) => ({ default: m.LoginPage })),
);
const ChangePassword = lazy(() =>
  import("./views/ChangePassword").then((m) => ({ default: m.ChangePassword })),
);
const Wizard = lazy(() =>
  import("./views/Onboarding/Wizard").then((m) => ({ default: m.Wizard })),
);
const OrganizationSuspended = lazy(() =>
  import("./views/OrganizationSuspended").then((m) => ({
    default: m.OrganizationSuspended,
  })),
);
const Dashboard = lazy(() =>
  import("./views/Dashboard").then((m) => ({ default: m.Dashboard })),
);
const Quotations = lazy(() =>
  import("./views/Quotations").then((m) => ({ default: m.Quotations })),
);
const Orders = lazy(() =>
  import("./views/Orders").then((m) => ({ default: m.Orders })),
);
const Comprobations = lazy(() =>
  import("./views/Comprobations").then((m) => ({ default: m.Comprobations })),
);
const SalesPage = lazy(() =>
  import("./views/Sales").then((m) => ({ default: m.SalesPage })),
);
const Customers = lazy(() =>
  import("./views/Customers").then((m) => ({ default: m.Customers })),
);
const Tienda = lazy(() =>
  import("./views/Tienda").then((m) => ({ default: m.Tienda })),
);
const OrganizationsList = lazy(() =>
  import("./views/superadmin/OrganizationsList").then((m) => ({
    default: m.OrganizationsList,
  })),
);

const AppRoutes = () => (
  <Router>
    <Routes>
      {/* Login (público) */}
      <Route
        path="/"
        element={
          <AuthLayout>
            <Suspense
              fallback={
                <div className="flex min-h-[60vh] items-center justify-center">
                  <Loader />
                </div>
              }
            >
              <LoginPage />
            </Suspense>
          </AuthLayout>
        }
      />

      {/* Gates previos al dashboard: cambio de contraseña forzado y wizard
          de onboarding. Viven fuera de ProtectedLayout (no tienen sidebar)
          pero requieren estar autenticado igual. */}
      <Route
        path="/cambiar-contrasena"
        element={
          <OnboardingLayout>
            <Suspense
              fallback={
                <div className="flex min-h-[60vh] items-center justify-center">
                  <Loader />
                </div>
              }
            >
              <ChangePassword />
            </Suspense>
          </OnboardingLayout>
        }
      />
      <Route
        path="/bienvenida"
        element={
          <OnboardingLayout>
            <Suspense
              fallback={
                <div className="flex min-h-[60vh] items-center justify-center">
                  <Loader />
                </div>
              }
            >
              <Wizard />
            </Suspense>
          </OnboardingLayout>
        }
      />
      <Route
        path="/organizacion-suspendida"
        element={
          <OnboardingLayout>
            <Suspense
              fallback={
                <div className="flex min-h-[60vh] items-center justify-center">
                  <Loader />
                </div>
              }
            >
              <OrganizationSuspended />
            </Suspense>
          </OnboardingLayout>
        }
      />

      {/* Rutas autenticadas: MainLayout persistente, solo el contenido suspende */}
      <Route element={<ProtectedLayout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/presupuestos" element={<Quotations />} />
        <Route path="/pedidos" element={<Orders />} />
        <Route path="/facturas" element={<Comprobations />} />
        <Route path="/Ventas" element={<SalesPage />} />
        <Route path="/Clientes" element={<Customers />} />
        <Route path="/tienda" element={<Tienda />} />
      </Route>

      {/* Panel superadmin (sdd/planes-y-billing): rutas de plataforma, fuera
          de ProtectedLayout. Guard propio en SuperadminLayout (rol !==
          SUPERADMIN -> /dashboard). */}
      <Route element={<SuperadminLayout />}>
        <Route path="/superadmin/organizaciones" element={<OrganizationsList />} />
      </Route>
    </Routes>
  </Router>
);

export default AppRoutes;

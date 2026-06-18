import { Suspense, lazy } from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import AuthLayout from "./layouts/AuthLayout";
import ProtectedLayout from "./layouts/ProtectedLayout";
import { Loader } from "./components/atoms/loader";

const LoginPage = lazy(() =>
  import("./views/LoginPage").then((m) => ({ default: m.LoginPage })),
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

      {/* Rutas autenticadas: MainLayout persistente, solo el contenido suspende */}
      <Route element={<ProtectedLayout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/presupuestos" element={<Quotations />} />
        <Route path="/pedidos" element={<Orders />} />
        <Route path="/facturas" element={<Comprobations />} />
        <Route path="/Ventas" element={<SalesPage />} />
        <Route path="/Clientes" element={<Customers />} />
      </Route>
    </Routes>
  </Router>
);

export default AppRoutes;

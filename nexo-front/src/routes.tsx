import { Suspense, lazy } from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import AuthLayout from "./layouts/AuthLayout";
import MainLayout from "./layouts/MainLayout";
import PrivateRoute from "./components/privateRoute";
import { Loader } from "./components/atoms/loader";

// Usar una función de importación que devuelve un módulo con exportación predeterminada
const LoginPage = lazy(() =>
  import("./views/LoginPage").then((module) => ({ default: module.LoginPage }))
);
const Dashboard = lazy(() =>
  import("./views/Dashboard").then((module) => ({ default: module.Dashboard }))
);
const Quotations = lazy(() =>
  import("./views/Quotations").then((module) => ({
    default: module.Quotations,
  }))
);
const Orders = lazy(() =>
  import("./views/Orders").then((module) => ({ default: module.Orders }))
);
const Comprobations = lazy(() =>
  import("./views/Comprobations").then((module) => ({
    default: module.Comprobations,
  }))
);
const SalesPage = lazy(() =>
  import("./views/Sales").then((module) => ({ default: module.SalesPage }))
);
const Customers = lazy(() =>
  import("./views/Customers").then((module) => ({ default: module.Customers }))
);

const AppRoutes = () => (
  <Router>
    <Suspense fallback={<div className="flex-jc-ac h-100-vh"><Loader /></div>}>
      <Routes>
        <Route
          path="/"
          element={
            <AuthLayout>
              <LoginPage />
            </AuthLayout>
          }
        />
        <Route
          path="/dashboard"
          element={
            <PrivateRoute
              element={
                <MainLayout>
                  <Dashboard />
                </MainLayout>
              }
            />
          }
        />
        <Route
          path="/presupuestos"
          element={
            <PrivateRoute
              element={
                <MainLayout>
                  <Quotations />
                </MainLayout>
              }
            />
          }
        />
        <Route
          path="/pedidos"
          element={
            <PrivateRoute
              element={
                <MainLayout>
                  <Orders />
                </MainLayout>
              }
            />
          }
        />
        <Route
          path="/facturas"
          element={
            <PrivateRoute
              element={
                <MainLayout>
                  <Comprobations />
                </MainLayout>
              }
            />
          }
        />
        <Route
          path="/Ventas"
          element={
            <PrivateRoute
              element={
                <MainLayout>
                  <SalesPage />
                </MainLayout>
              }
            />
          }
        />
        <Route
          path="/Clientes"
          element={
            <PrivateRoute
              element={
                <MainLayout>
                  <Customers />
                </MainLayout>
              }
            />
          }
        />
      </Routes>
    </Suspense>
  </Router>
);

export default AppRoutes;

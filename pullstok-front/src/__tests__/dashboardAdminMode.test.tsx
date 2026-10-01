import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// /stock en modo ADMINISTRATIVO reutiliza Dashboard recortado: solo el listado
// de productos, sin POS, estadísticas, venta rápida ni chat de ventas.

const uiMode = vi.hoisted(() => ({ value: "ADMINISTRATIVO" as "OPERATIVO" | "ADMINISTRATIVO" }));
vi.mock("@/hooks/useUiMode", () => ({ useUiMode: () => uiMode.value }));

vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useSearchParams: () => [new URLSearchParams(), vi.fn()] };
});
vi.mock("@/components/hooks/useProducts", () => ({
  useProducts: vi.fn(() => ({
    products: [{ _id: "p1", name: "Placa Granito", price: 100, quantity: 1, provider: null }],
    loading: false,
    error: null,
  })),
  useProductFacets: vi.fn(() => ({ titles: [], categories: [], variants: [] })),
}));
vi.mock("@/components/hooks/useSales", () => ({
  useGetSales: vi.fn(() => ({ sales: [], loading: false })),
  useCreateSale: vi.fn(() => ({ createSale: vi.fn() })),
}));
vi.mock("@/components/hooks/useStockSummary", () => ({
  useStockSummary: vi.fn(() => ({ summary: { branches: [] }, loading: false, error: null })),
}));
vi.mock("@/components/hooks/useBudget", () => ({
  useGetBudgets: vi.fn(() => ({ budgets: [], loading: false })),
}));
vi.mock("@/components/hooks/useOrder", () => ({
  useOrders: vi.fn(() => ({ orders: [], loading: false })),
}));
vi.mock("@/components/molecules/ProductsTable", () => ({
  ProductsTable: () => <div data-testid="products-table" />,
}));
vi.mock("@/components/molecules/ProductDrawer", () => ({ ProductDrawer: () => null }));
vi.mock("@/components/molecules/QuickPriceModal", () => ({ QuickPriceModal: () => null }));
vi.mock("@/components/molecules/SalesDrawer", () => ({ SalesDrawer: () => null }));
vi.mock("@/components/molecules/StatCard", () => ({
  StatCard: () => <div data-testid="stat-card" />,
}));
vi.mock("@/components/molecules/GenericModal", () => ({ GenericModal: () => null }));
vi.mock("@/components/molecules/GenericModal/ModalContentUploadCsv", () => ({
  ModalContentUploadCsv: () => null,
}));
vi.mock("@/components/molecules/PrintProductList", () => ({ PrintProductList: () => null }));
vi.mock("@/components/molecules/SecoBarcodesReportDialog", () => ({
  SecoBarcodesReportDialog: () => null,
}));
vi.mock("@/components/atoms/loader", () => ({ Loader: () => <div data-testid="loader" /> }));
vi.mock("@/views/Statistics", () => ({ Statistics: () => null }));
vi.mock("@/views/UnifiedPos", () => ({
  UnifiedPos: () => <div data-testid="unified-pos" />,
}));
vi.mock("@/components/organisms/VendorChat", () => ({
  VendorChatWidget: () => <div data-testid="vendor-chat" />,
}));

import { Dashboard } from "@/views/Dashboard";

function renderAs(role: string, branchIds: string[] = []) {
  localStorage.setItem("user", JSON.stringify({ id: "u1", role, branchIds }));
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Dashboard />
    </QueryClientProvider>,
  );
}

describe("Dashboard en modo ADMINISTRATIVO (/stock)", () => {
  beforeEach(() => {
    localStorage.clear();
    uiMode.value = "ADMINISTRATIVO";
  });

  it("muestra solo el listado de productos: sin estadísticas, venta rápida ni chat", () => {
    renderAs("ADMIN");

    expect(screen.getByRole("heading", { name: "Stock" })).toBeInTheDocument();
    expect(screen.getByTestId("products-table")).toBeInTheDocument();
    expect(screen.queryByTestId("stat-card")).not.toBeInTheDocument();
    expect(screen.queryByText("Nueva venta")).not.toBeInTheDocument();
    expect(screen.queryByText("Alimento seco · barras")).not.toBeInTheDocument();
    expect(screen.queryByTestId("vendor-chat")).not.toBeInTheDocument();
  });

  it("un VENDEDOR con una sola sucursal ve el listado, no el POS", () => {
    renderAs("VENDEDOR", ["b1"]);

    expect(screen.queryByTestId("unified-pos")).not.toBeInTheDocument();
    expect(screen.getByTestId("products-table")).toBeInTheDocument();
  });

  it("en modo OPERATIVO no cambia: el VENDEDOR con una sucursal sigue en el POS", () => {
    uiMode.value = "OPERATIVO";
    renderAs("VENDEDOR", ["b1"]);

    expect(screen.getByTestId("unified-pos")).toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// /productos: el VENDEDOR (OPERATIVO, una sola sucursal) ve el listado completo
// con ProductDrawer en vez del POS. El default /dashboard sigue siendo el POS.

vi.mock("@/hooks/useUiMode", () => ({ useUiMode: () => "OPERATIVO" }));
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
  ProductsTable: ({ products, onEdit }: any) => (
    <button data-testid="products-table" onClick={() => onEdit(products[0])}>
      editar
    </button>
  ),
}));
vi.mock("@/components/molecules/ProductDrawer", () => ({
  ProductDrawer: ({ open, product }: any) =>
    open ? <div data-testid="product-drawer">{product ? product.name : "nuevo"}</div> : null,
}));
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

function renderAs(role: string, branchIds: string[], forceProductList?: boolean) {
  localStorage.setItem("user", JSON.stringify({ id: "u1", role, branchIds }));
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Dashboard forceProductList={forceProductList} />
    </QueryClientProvider>,
  );
}

describe("Dashboard con forceProductList (/productos)", () => {
  beforeEach(() => localStorage.clear());

  it("VENDEDOR de una sucursal ve el listado, no el POS", () => {
    renderAs("VENDEDOR", ["b1"], true);

    expect(screen.queryByTestId("unified-pos")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Productos" })).toBeInTheDocument();
    expect(screen.getByTestId("products-table")).toBeInTheDocument();
  });

  it("permite crear un producto nuevo y editar uno existente (ProductDrawer)", () => {
    renderAs("VENDEDOR", ["b1"], true);

    fireEvent.click(screen.getByText("Agregar producto"));
    expect(screen.getByTestId("product-drawer")).toHaveTextContent("nuevo");
  });

  it("abre el ProductDrawer al editar una fila", () => {
    renderAs("VENDEDOR", ["b1"], true);

    fireEvent.click(screen.getByTestId("products-table"));
    expect(screen.getByTestId("product-drawer")).toHaveTextContent("Placa Granito");
  });

  it("oculta lo exclusivo del Dashboard operativo: estadísticas, nueva venta, chat", () => {
    renderAs("VENDEDOR", ["b1"], true);

    expect(screen.queryByTestId("stat-card")).not.toBeInTheDocument();
    expect(screen.queryByText("Nueva venta")).not.toBeInTheDocument();
    expect(screen.queryByTestId("vendor-chat")).not.toBeInTheDocument();
    expect(screen.queryByText("Alimento seco · barras")).not.toBeInTheDocument();
  });

  it("sin forceProductList el VENDEDOR sigue en el POS (/dashboard intacto)", () => {
    renderAs("VENDEDOR", ["b1"]);
    expect(screen.getByTestId("unified-pos")).toBeInTheDocument();
  });

  it("CASHIER con una sucursal sigue en el POS en /dashboard", () => {
    renderAs("CASHIER", ["b1"]);
    expect(screen.getByTestId("unified-pos")).toBeInTheDocument();
  });
});

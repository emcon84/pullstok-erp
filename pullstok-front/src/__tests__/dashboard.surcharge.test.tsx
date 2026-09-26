import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CartItem } from "@/models/salesModel";

vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
  };
});

vi.mock("@/components/hooks/useProducts", () => ({
  useProducts: vi.fn(),
  useProductFacets: vi.fn(),
}));
vi.mock("@/components/hooks/useSales", () => ({
  useGetSales: vi.fn(),
  useCreateSale: vi.fn(),
}));
vi.mock("@/components/hooks/useStockSummary", () => ({ useStockSummary: vi.fn() }));
vi.mock("@/components/hooks/useBudget", () => ({ useGetBudgets: vi.fn() }));
vi.mock("@/components/hooks/useOrder", () => ({ useOrders: vi.fn() }));

vi.mock("@/components/molecules/ProductsTable", () => ({ ProductsTable: () => null }));
vi.mock("@/components/molecules/ProductDrawer", () => ({ ProductDrawer: () => null }));
vi.mock("@/components/molecules/QuickPriceModal", () => ({ QuickPriceModal: () => null }));
vi.mock("@/components/molecules/StatCard", () => ({ StatCard: () => null }));
vi.mock("@/components/molecules/GenericModal", () => ({ GenericModal: () => null }));
vi.mock("@/components/molecules/GenericModal/ModalContentUploadCsv", () => ({
  ModalContentUploadCsv: () => null,
}));
vi.mock("@/components/molecules/PrintProductList", () => ({ PrintProductList: () => null }));
vi.mock("@/components/atoms/loader", () => ({ Loader: () => null }));
vi.mock("@/views/Statistics", () => ({ Statistics: () => null }));
vi.mock("@/views/VendorDashboard", () => ({ VendorDashboard: () => null }));

// Capture the onConfirm the dashboard hands the drawer.
const drawer = vi.hoisted(() => ({
  onConfirm: undefined as undefined | ((...args: unknown[]) => unknown),
}));
vi.mock("@/components/molecules/SalesDrawer", () => ({
  SalesDrawer: (props: { onConfirm: (...args: unknown[]) => unknown }) => {
    drawer.onConfirm = props.onConfirm;
    return null;
  },
}));

import { Dashboard } from "@/views/Dashboard";
import { useProducts, useProductFacets } from "@/components/hooks/useProducts";
import { useGetSales, useCreateSale } from "@/components/hooks/useSales";
import { useStockSummary } from "@/components/hooks/useStockSummary";
import { useGetBudgets } from "@/components/hooks/useBudget";
import { useOrders } from "@/components/hooks/useOrder";

const cart = [{ product: { _id: "p1", name: "X", price: 1000 }, quantity: 1, totalPrice: 1000 }] as CartItem[];
const payments = [{ method: "TARJETA_CREDITO" as const, amount: 1000 }];

describe("Dashboard — credit card surcharge", () => {
  const createSale = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    drawer.onConfirm = undefined;
    vi.mocked(useProducts).mockReturnValue({ products: [], loading: false, error: null } as never);
    vi.mocked(useProductFacets).mockReturnValue({ titles: [], categories: [], variants: [] } as never);
    vi.mocked(useGetSales).mockReturnValue({ sales: [], loading: false } as never);
    vi.mocked(useCreateSale).mockReturnValue({ createSale } as never);
    vi.mocked(useStockSummary).mockReturnValue({
      summary: { branches: [] },
      loading: false,
      error: null,
    } as never);
    vi.mocked(useGetBudgets).mockReturnValue({ budgets: [], loading: false } as never);
    vi.mocked(useOrders).mockReturnValue({ orders: [], loading: false } as never);
  });

  it("forwards surchargePct to createSale", async () => {
    localStorage.setItem("user", JSON.stringify({ role: "admin", branchIds: [] }));
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Dashboard />
      </QueryClientProvider>,
    );

    await drawer.onConfirm!(cart, "", "", "", payments, "cs-1", 5, 10);

    expect(createSale).toHaveBeenCalledWith({
      cart,
      orderId: undefined,
      payments,
      cashSessionId: "cs-1",
      discountPct: 5,
      surchargePct: 10,
    });
  });
});

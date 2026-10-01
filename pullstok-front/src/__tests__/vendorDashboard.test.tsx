import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("@/components/hooks/useVendorCatalog", () => ({
  useVendorCatalog: vi.fn(),
}));
vi.mock("@/components/hooks/useVendorCart", () => ({
  useVendorCart: vi.fn(),
}));
vi.mock("@/components/hooks/useVendorQuantityModal", () => ({
  useVendorQuantityModal: vi.fn(),
}));
vi.mock("@/components/hooks/useVendorCheckout", () => ({
  useVendorCheckout: vi.fn(),
}));
vi.mock("@/components/hooks/useVendorKeyboard", () => ({
  useVendorKeyboard: vi.fn(),
}));
vi.mock("@/components/hooks/useCashSession", () => ({
  useGetCurrentCashSession: vi.fn(),
}));
vi.mock("@/hooks/useVendorChat", () => ({
  useListVendorChats: vi.fn(() => ({ data: [] })),
  useSendVendorMessage: vi.fn(() => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
  })),
  useCreateVendorChat: vi.fn(() => ({
    mutateAsync: vi.fn().mockResolvedValue({
      id: "chat-1",
      organizationId: "org-1",
      sellerId: "",
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
    }),
  })),
  vendorChatKeys: {
    conversations: ["vendorChat", "conversations"],
    conversation: (id: string) => ["vendorChat", "conversation", id],
    messages: (convId: string) => ["vendorChat", "messages", convId],
  },
  useGetMessages: vi.fn(() => ({ data: [] })),
  useCloseVendorChat: vi.fn(() => ({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
  })),
}));
vi.mock("@/components/molecules/VendorSearchBar", () => ({
  VendorSearchBar: () => <div data-testid="search-bar" />,
}));
vi.mock("@/components/molecules/ProductTable", () => ({
  ProductTable: () => <div data-testid="product-table" />,
}));
vi.mock("@/components/molecules/QuantityModal", () => ({
  QuantityModal: () => <div data-testid="qty-modal" />,
}));
vi.mock("@/components/molecules/VendorCartSheet", () => ({
  VendorCartSheet: () => <div data-testid="cart-sheet" />,
}));
vi.mock("@/components/molecules/ProductDrawer", () => ({
  ProductDrawer: () => <div data-testid="product-drawer" />,
}));
vi.mock("@/components/atoms/loader", () => ({
  Loader: () => <div data-testid="loader" />,
}));

import { VendorDashboard } from "@/views/VendorDashboard";
import { useVendorCatalog } from "@/components/hooks/useVendorCatalog";
import { useVendorCart } from "@/components/hooks/useVendorCart";
import { useVendorQuantityModal } from "@/components/hooks/useVendorQuantityModal";
import { useVendorCheckout } from "@/components/hooks/useVendorCheckout";
import { useVendorKeyboard } from "@/components/hooks/useVendorKeyboard";
import { useGetCurrentCashSession } from "@/components/hooks/useCashSession";

const queryClient = new QueryClient();

const mockUseVendorCatalog = vi.mocked(useVendorCatalog);

function makeCatalog(overrides: Record<string, unknown> = {}) {
  return {
    filter: "",
    setFilter: vi.fn(),
    categoryFilter: "",
    setCategoryFilter: vi.fn(),
    titleFilter: null as string | null,
    setTitleFilter: vi.fn(),
    items: [],
    isLoadingInitial: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    loadMore: vi.fn(),
    selectedIndex: -1,
    setSelectedIndex: vi.fn(),
    searchInputRef: { current: null },
    sentinelRef: { current: null },
    resetSelection: vi.fn(),
    registerRow: vi.fn(),
    ...overrides,
  };
}

function renderVendor(catalogOverrides: Record<string, unknown> = {}) {
  const catalog = makeCatalog(catalogOverrides);
  mockUseVendorCatalog.mockReturnValue(catalog as never);
  vi.mocked(useVendorCart).mockReturnValue({
    items: [],
    totalAmount: 0,
    itemCount: 0,
    addToCart: vi.fn(),
    updateQuantity: vi.fn(),
    removeFromCart: vi.fn(),
    clearCart: vi.fn(),
  } as never);
  vi.mocked(useVendorQuantityModal).mockReturnValue({
    qtyModal: null,
    qty: 0,
    setQty: vi.fn(),
    directSelling: false,
    saleMode: "sale",
    setSaleMode: vi.fn(),
    amount: 0,
    setAmount: vi.fn(),
    openQtyModal: vi.fn(),
    closeQtyModal: vi.fn(),
    confirmAddToCart: vi.fn(),
    handleDirectSale: vi.fn(),
  } as never);
  vi.mocked(useVendorCheckout).mockReturnValue({
    confirming: false,
    savingOrder: false,
    handleConfirmSale: vi.fn(),
    handleSaveOrder: vi.fn(),
  } as never);
  vi.mocked(useVendorKeyboard).mockReturnValue(undefined as never);
  vi.mocked(useGetCurrentCashSession).mockReturnValue({
    session: null,
    loading: false,
    error: null,
    refetch: vi.fn(),
  } as never);

  render(
    <QueryClientProvider client={queryClient}>
      <VendorDashboard branchId="branch-1" />
    </QueryClientProvider>,
  );
  return catalog;
}

describe("VendorDashboard — sin chips de filtros rápidos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("no renderiza las filas de chips (categorías, títulos de planilla, marcas)", () => {
    renderVendor();

    expect(screen.queryByText("Títulos")).not.toBeInTheDocument();
    expect(screen.queryByText("Categorías")).not.toBeInTheDocument();
    expect(screen.queryByText("Marca")).not.toBeInTheDocument();
  });

  it("mantiene el switch 'Solo lo que trabajo'", () => {
    renderVendor();

    expect(screen.getByText("Solo lo que trabajo")).toBeInTheDocument();
  });

  it("sin resultados con un filtro activo ofrece 'Limpiar filtros' que resetea la búsqueda", () => {
    const catalog = renderVendor({ filter: "zzz" });

    fireEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));

    expect(catalog.setFilter).toHaveBeenCalledWith("");
    expect(catalog.setCategoryFilter).toHaveBeenCalledWith("");
    expect(catalog.setTitleFilter).toHaveBeenCalledWith(null);
  });
});

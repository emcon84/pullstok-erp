import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

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

const mockUseVendorCatalog = vi.mocked(useVendorCatalog);

const TITLE_KEY = "SIEGER|SUPER PREMIUM PARA PERROS|SIEGER PUPPY";

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
    facetsCategories: [{ name: "Alimentos" }, { name: "Accesorios" }],
    facetsVariants: [],
    facetsTitles: [{ key: TITLE_KEY, label: "SIEGER PUPPY", count: 3 }],
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

  render(<VendorDashboard branchId="branch-1" />);
  return catalog;
}

function clickPill(text: string) {
  const el = screen
    .getAllByText(text)
    .find((n) => n.className.includes("cursor-pointer"));
  if (!el) throw new Error(`pill ${text} not found`);
  fireEvent.click(el);
}

describe("VendorDashboard — filtro de títulos de planilla (server-side, AND)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderiza los chips de títulos desde las facets del catálogo", () => {
    renderVendor();

    expect(screen.getByText("Títulos")).toBeInTheDocument();
    expect(screen.getByText("SIEGER PUPPY (3)")).toBeInTheDocument();
  });

  it("elegir un título NO limpia la categoría (filtros combinados AND)", () => {
    const catalog = renderVendor({ categoryFilter: "Alimentos" });

    clickPill("SIEGER PUPPY (3)");

    expect(catalog.setTitleFilter).toHaveBeenCalledWith(TITLE_KEY);
    // Sin exclusión mutua: elegir título no toca la categoría.
    expect(catalog.setCategoryFilter).not.toHaveBeenCalled();
  });

  it("elegir una categoría NO limpia el título (filtros combinados AND)", () => {
    const catalog = renderVendor({ titleFilter: TITLE_KEY });

    clickPill("Accesorios");

    expect(catalog.setCategoryFilter).toHaveBeenCalledWith("Accesorios");
    // Sin exclusión mutua: elegir categoría no toca el título.
    expect(catalog.setTitleFilter).not.toHaveBeenCalled();
  });

  it("toggle del título activo lo deselecciona (null) y refetchea sin ?title=", () => {
    const catalog = renderVendor({ titleFilter: TITLE_KEY });

    clickPill("SIEGER PUPPY (3)");

    expect(catalog.setTitleFilter).toHaveBeenCalledWith(null);
  });
});

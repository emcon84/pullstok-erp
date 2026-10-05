import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/components/hooks/useProductStock", () => ({ useProductStock: vi.fn() }));
vi.mock("@/components/hooks/useBranches", () => ({ useBranches: vi.fn() }));
vi.mock("@/components/molecules/ProductDrawer", () => ({
  ProductDrawer: () => <div data-testid="dup-drawer" />,
}));
vi.mock("@/services/productService", () => ({ getProductStock: vi.fn() }));
vi.mock("@/services/onboardingService", () => ({
  getMe: vi.fn().mockResolvedValue({ sellsWholesale: false }),
}));
vi.mock("@/components/hooks/useCashSession", () => ({
  useGetCurrentCashSession: vi.fn(() => ({ session: null, loading: false })),
}));
vi.mock("@/components/hooks/useVendorCheckout", () => ({
  useVendorCheckout: vi.fn(() => ({
    confirming: false,
    savingOrder: false,
    handleConfirmSale: vi.fn(),
    handleSaveOrder: vi.fn(),
  })),
}));
vi.mock("@/components/molecules/VendorCartSheet", () => ({
  VendorCartSheet: () => null,
}));
vi.mock("@/lib/offlineCatalog", () => ({
  ensureOfflineCatalog: vi.fn().mockResolvedValue(undefined),
  syncOfflineCatalog: vi.fn().mockResolvedValue(undefined),
  isCatalogStale: vi.fn(() => false),
  searchProducts: vi.fn(() => []),
  lookupProductByCode: vi.fn(),
}));

import { StockScannerPage } from "@/views/StockScannerPage";
import { useProductStock } from "@/components/hooks/useProductStock";
import { useBranches } from "@/components/hooks/useBranches";
import { getProductStock } from "@/services/productService";
import { lookupProductByCode } from "@/lib/offlineCatalog";

const offlineAprax = {
  id: "p1",
  name: "APRAX RAZAS MEDIANAS X 60 COMP",
  code: "SKU-1",
  barcode: "779123",
  price: 80000,
  priceKgLista: null,
  priceKgSuelto: null,
  priceKgSueltoManual: false,
  description: null,
  categoryId: "cat-farm",
  categoryName: "FARMACIA",
  variants: [],
  hasPresentations: true,
  presentations: [
    { id: "pr-box", name: "Caja", factor: 60, price: 80000, wholesalePrice: null, sortOrder: 0 },
    { id: "pr-pill", name: "Pastilla", factor: 1, price: 1500, wholesalePrice: null, sortOrder: 2 },
  ],
};

function renderScanner() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <StockScannerPage />
    </QueryClientProvider>,
  );
}

describe("StockScannerPage — modo Vender con producto del catálogo offline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem("user", JSON.stringify({ role: "VENDEDOR", branchIds: ["b1"] }));
    vi.mocked(useProductStock).mockReturnValue({
      stock: undefined,
      loading: false,
      error: null,
      updateBranchStock: vi.fn(),
      updating: false,
    });
    vi.mocked(useBranches).mockReturnValue({
      branches: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    vi.mocked(getProductStock).mockResolvedValue({
      productId: "p1",
      branches: [{ branchId: "b1", branchName: "Sucursal 1", quantity: 120, isHeadquarters: false, canEdit: true }],
    });
    vi.mocked(lookupProductByCode).mockReturnValue(offlineAprax);
  });

  it("opens the presentation picker (caja / pastilla) instead of adding a closed box", async () => {
    renderScanner();
    fireEvent.click(screen.getByRole("button", { name: "Vender" }));

    const input = screen.getByPlaceholderText(/escribí el código/i);
    fireEvent.change(input, { target: { value: "779123" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(await screen.findByText("Elegí la presentación a vender")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Caja/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Pastilla/ })).toBeInTheDocument();
    expect(screen.queryByText(/Agregado:/)).not.toBeInTheDocument();
  });
});

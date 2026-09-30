import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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
  VendorCartSheet: (props: { open: boolean }) =>
    props.open ? <div data-testid="cart-sheet" /> : null,
}));

import { StockScannerPage } from "@/views/StockScannerPage";
import { useProductStock } from "@/components/hooks/useProductStock";
import { useBranches } from "@/components/hooks/useBranches";
import { getProductStock } from "@/services/productService";
import { toast } from "react-toastify";

const fetchMock = vi.fn();

const product = (id: string, name: string, price: number) => ({
  id,
  name,
  code: `SKU-${id}`,
  barcode: `bc-${id}`,
  price,
  quantity: 5,
  description: null,
  category: null,
});

function scanManually(code: string) {
  const input = screen.getByPlaceholderText(/escribí el código/i);
  fireEvent.change(input, { target: { value: code } });
  fireEvent.keyDown(input, { key: "Enter" });
}

function renderScanner() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <StockScannerPage />
    </QueryClientProvider>,
  );
}

describe("StockScannerPage — modo Vender", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem("user", JSON.stringify({ role: "VENDEDOR", branchIds: ["b1"] }));
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
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
      branches: [{ branchId: "b1", branchName: "Sucursal 1", quantity: 4, isHeadquarters: false, canEdit: true }],
    });
  });

  it("starts in Stock mode with a Stock | Vender selector and no sell bar", () => {
    renderScanner();
    expect(screen.getByRole("button", { name: "Stock" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Vender" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("button", { name: /ver pedido/i })).not.toBeInTheDocument();
  });

  it("Stock mode still shows the product card after a scan", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => product("p1", "Collar de Cuero", 1500) });
    renderScanner();
    scanManually("779123");
    expect(await screen.findByText("Collar de Cuero")).toBeInTheDocument();
    expect(screen.queryByText(/Agregado:/)).not.toBeInTheDocument();
  });

  it("Vender mode adds each scan to the cart instead of opening the product card", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => product("p1", "Collar de Cuero", 1500) });
    renderScanner();
    fireEvent.click(screen.getByRole("button", { name: "Vender" }));

    scanManually("779123");
    expect(await screen.findByText("Agregado: Collar de Cuero ×1")).toBeInTheDocument();
    expect(screen.queryByText(/Stock ·/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ver pedido/i })).toHaveTextContent("1.500");
    // ready for the next scan: the input is cleared
    expect(screen.getByPlaceholderText(/escribí el código/i)).toHaveValue("");

    scanManually("779123");
    expect(await screen.findByText("Agregado: Collar de Cuero ×2")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("vendor-cart") || "[]")).toHaveLength(1);
  });

  it("Vender mode accumulates different products in one cart", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => product("p1", "Collar de Cuero", 1500) })
      .mockResolvedValueOnce({ ok: true, json: async () => product("p2", "Pelota", 500) });
    vi.mocked(getProductStock).mockImplementation(async (id: string) => ({
      productId: id,
      branches: [{ branchId: "b1", branchName: "S1", quantity: 9, isHeadquarters: false, canEdit: true }],
    }));
    renderScanner();
    fireEvent.click(screen.getByRole("button", { name: "Vender" }));

    scanManually("a");
    await screen.findByText("Agregado: Collar de Cuero ×1");
    scanManually("b");
    await screen.findByText("Agregado: Pelota ×1");
    expect(screen.getByRole("button", { name: /ver pedido/i })).toHaveTextContent("2");
    expect(screen.getByRole("button", { name: /ver pedido/i })).toHaveTextContent("2.000");
  });

  it("Vender mode tells the user when a product has no stock and adds nothing", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => product("p1", "Collar de Cuero", 1500) });
    vi.mocked(getProductStock).mockResolvedValue({
      productId: "p1",
      branches: [{ branchId: "b1", branchName: "S1", quantity: 0, isHeadquarters: false, canEdit: true }],
    });
    renderScanner();
    fireEvent.click(screen.getByRole("button", { name: "Vender" }));
    scanManually("779123");

    await waitFor(() =>
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Producto sin stock: Collar de Cuero"),
    );
    expect(screen.queryByRole("button", { name: /ver pedido/i })).not.toBeInTheDocument();
  });

  it("Vender mode keeps the assignment flow for an unknown barcode", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ message: "Producto no encontrado" }) });
    renderScanner();
    fireEvent.click(screen.getByRole("button", { name: "Vender" }));
    scanManually("000111");
    expect(await screen.findByText("Vincular código")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ver pedido/i })).not.toBeInTheDocument();
  });

  it("the cart survives switching back to Stock and to Vender again", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => product("p1", "Collar de Cuero", 1500) });
    renderScanner();
    fireEvent.click(screen.getByRole("button", { name: "Vender" }));
    scanManually("779123");
    await screen.findByText("Agregado: Collar de Cuero ×1");

    fireEvent.click(screen.getByRole("button", { name: "Stock" }));
    expect(screen.queryByRole("button", { name: /ver pedido/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Vender" }));
    expect(screen.getByRole("button", { name: /ver pedido/i })).toHaveTextContent("1.500");
  });
});

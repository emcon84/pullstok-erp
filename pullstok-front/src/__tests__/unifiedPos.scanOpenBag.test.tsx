import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/components/organisms/VendorCatalogTab", () => ({
  VendorCatalogTab: () => <div data-testid="catalog-tab" />,
}));
vi.mock("@/components/organisms/LooseSellTab", () => ({
  LooseSellTab: () => <div data-testid="loose-tab" />,
}));
vi.mock("@/components/hooks/useVendorCart", () => ({ useVendorCart: vi.fn() }));
vi.mock("@/components/hooks/useVendorCheckout", () => ({ useVendorCheckout: vi.fn() }));
vi.mock("@/components/hooks/useCashSession", () => ({ useGetCurrentCashSession: vi.fn() }));
vi.mock("@/components/molecules/VendorOrderPanel", () => ({
  VendorOrderPanel: () => <div data-testid="order-panel" />,
}));
vi.mock("react-toastify", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { UnifiedPos } from "@/views/UnifiedPos";
import { useVendorCart } from "@/components/hooks/useVendorCart";
import { useVendorCheckout } from "@/components/hooks/useVendorCheckout";
import { useGetCurrentCashSession } from "@/components/hooks/useCashSession";

function renderPos() {
  vi.mocked(useVendorCart).mockReturnValue({
    items: [],
    totalAmount: 0,
    itemCount: 0,
    addToCart: vi.fn(),
    updateQuantity: vi.fn(),
    removeFromCart: vi.fn(),
    clearCart: vi.fn(),
  } as never);
  vi.mocked(useVendorCheckout).mockReturnValue({
    confirming: false,
    savingOrder: false,
    handleConfirmSale: vi.fn(),
    handleSaveOrder: vi.fn(),
  } as never);
  vi.mocked(useGetCurrentCashSession).mockReturnValue({
    session: { id: "cs-1", status: "OPEN" },
    loading: false,
    error: null,
    refetch: vi.fn(),
  } as never);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <UnifiedPos branchId="branch-1" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function mockFetchWith(product: Record<string, unknown>) {
  const fetchMock = vi.fn().mockResolvedValue({
    status: 200,
    ok: true,
    json: () => Promise.resolve({ isScale: false, product }),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function scanCode(code: string) {
  for (const ch of code.split("")) fireEvent.keyDown(window, { key: ch });
  fireEvent.keyDown(window, { key: "Enter" });
}

const baseProduct = {
  _id: "p1",
  id: "p1",
  name: "Royal 15kg",
  price: 18400,
  code: "7791234567890",
  barcode: "7791234567890",
  weightKg: 15,
  quantity: 10,
  category: { name: "Perros" },
};

describe("UnifiedPos — 'Abrir bolsa' desde el modal de escaneo", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("muestra 'Abrir bolsa' en el modal si el producto admite venta suelta", async () => {
    mockFetchWith({ ...baseProduct, priceKgSuelto: 1200 });
    renderPos();
    scanCode("7791234567890");

    await screen.findByRole("button", { name: "Agregar al pedido" });
    expect(screen.getByRole("button", { name: /abrir bolsa/i })).toBeInTheDocument();
  });

  it("no muestra 'Abrir bolsa' si priceKgSuelto es null", async () => {
    mockFetchWith({ ...baseProduct, priceKgSuelto: null });
    renderPos();
    scanCode("7791234567890");

    await screen.findByRole("button", { name: "Agregar al pedido" });
    expect(screen.queryByRole("button", { name: /abrir bolsa/i })).not.toBeInTheDocument();
  });

  it("al clickear cierra el modal de escaneo y abre el diálogo buscando ese código solo", async () => {
    const fetchMock = mockFetchWith({ ...baseProduct, priceKgSuelto: 1200 });
    renderPos();
    scanCode("7791234567890");
    await screen.findByRole("button", { name: "Agregar al pedido" });
    fetchMock.mockClear();

    fireEvent.click(screen.getByRole("button", { name: /abrir bolsa/i }));

    // Modal de escaneo cerrado
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Agregar al pedido" })).not.toBeInTheDocument(),
    );
    // Diálogo abierto, con el código precargado y la búsqueda ya hecha
    expect(await screen.findByRole("dialog", { name: /abrir bolsa/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Escaneá o ingresá el código de barras")).toHaveValue(
      "7791234567890",
    );
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/products/by-scan/7791234567890"))).toBe(true),
    );
    expect(await screen.findByText("15.00 kg")).toBeInTheDocument();
  });

  it("al cerrar el diálogo no queda código precargado (reabrirlo manualmente lo muestra vacío)", async () => {
    mockFetchWith({ ...baseProduct, priceKgSuelto: 1200 });
    renderPos();
    scanCode("7791234567890");
    await screen.findByRole("button", { name: "Agregar al pedido" });
    fireEvent.click(screen.getByRole("button", { name: /abrir bolsa/i }));
    await screen.findByRole("dialog", { name: /abrir bolsa/i });

    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: /abrir bolsa/i })).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: /^abrir bolsa$/i }));
    expect(await screen.findByPlaceholderText("Escaneá o ingresá el código de barras")).toHaveValue("");
  });
});

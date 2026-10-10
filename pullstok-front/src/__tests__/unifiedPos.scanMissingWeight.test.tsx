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

const dogChow = {
  _id: "p2",
  id: "p2",
  name: "DOG CHOW ADULT RAZAS MEDIANAS Y GRANDES X20KG",
  price: 66000,
  code: "DC20",
  barcode: "7791234500020",
  weightKg: null,
  priceKgSuelto: null,
  quantity: 5,
  category: { name: "Perros" },
};

describe("UnifiedPos — alerta de peso faltante en el modal de escaneo", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("muestra la alerta con el kg del nombre si no hay peso cargado", async () => {
    mockFetchWith(dogChow);
    renderPos();
    scanCode("7791234500020");

    await screen.findByRole("button", { name: "Agregar al pedido" });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Falta cargar el peso");
    expect(alert).toHaveTextContent("20 kg");
    expect(alert).toHaveTextContent("Cargalo desde Productos");
  });

  it("no muestra la alerta si el peso está cargado", async () => {
    mockFetchWith({ ...dogChow, weightKg: 20 });
    renderPos();
    scanCode("7791234500020");

    await screen.findByRole("button", { name: "Agregar al pedido" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("no muestra la alerta si el nombre no indica kg", async () => {
    mockFetchWith({ ...dogChow, name: "COLLAR NYLON" });
    renderPos();
    scanCode("7791234500020");

    await screen.findByRole("button", { name: "Agregar al pedido" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("no bloquea 'Agregar al pedido'", async () => {
    mockFetchWith(dogChow);
    renderPos();
    scanCode("7791234500020");

    const add = await screen.findByRole("button", { name: "Agregar al pedido" });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(add).toBeEnabled();
    fireEvent.click(add);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Agregar al pedido" })).not.toBeInTheDocument(),
    );
  });
});

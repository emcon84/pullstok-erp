import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// sdd/venta-pastillas-sueltas-blister — modal de confirmación de bolsa
// cerrada escaneada: switch "Vender pastillas sueltas" visible SOLO para
// categoría FARMACIA. Mismo patrón de mocks que unifiedPos.test.tsx.
vi.mock("@/components/organisms/VendorCatalogTab", () => ({
  VendorCatalogTab: () => <div data-testid="catalog-tab" />,
}));
vi.mock("@/components/organisms/LooseSellTab", () => ({
  LooseSellTab: () => <div data-testid="loose-tab" />,
}));
vi.mock("@/components/hooks/useVendorCart", () => ({
  useVendorCart: vi.fn(),
}));
vi.mock("@/components/hooks/useVendorCheckout", () => ({
  useVendorCheckout: vi.fn(),
}));
vi.mock("@/components/hooks/useCashSession", () => ({
  useGetCurrentCashSession: vi.fn(),
}));
vi.mock("@/components/molecules/VendorOrderPanel", () => ({
  VendorOrderPanel: ({ cart }: { cart?: { itemCount?: number } }) => (
    <div data-testid="order-panel">{cart?.itemCount ?? 0}</div>
  ),
}));
vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { UnifiedPos } from "@/views/UnifiedPos";
import { useVendorCart } from "@/components/hooks/useVendorCart";
import { useVendorCheckout } from "@/components/hooks/useVendorCheckout";
import { useGetCurrentCashSession } from "@/components/hooks/useCashSession";

function makeCart(overrides: Record<string, unknown> = {}) {
  return {
    items: [],
    totalAmount: 0,
    itemCount: 0,
    addToCart: vi.fn(),
    updateQuantity: vi.fn(),
    removeFromCart: vi.fn(),
    clearCart: vi.fn(),
    ...overrides,
  };
}

function renderPos(cartOverrides: Record<string, unknown> = {}) {
  vi.mocked(useVendorCart).mockReturnValue(makeCart(cartOverrides) as never);
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
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <UnifiedPos branchId="branch-1" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function mockFetchWith(payload: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      status,
      ok: status >= 200 && status < 300,
      json: () => Promise.resolve(payload),
    }),
  );
}

function scanCode(code: string) {
  for (const ch of code.split("")) {
    if (/[A-Z]/.test(ch)) {
      fireEvent.keyDown(window, { key: "Shift" });
    }
    fireEvent.keyDown(window, { key: ch });
  }
  fireEvent.keyDown(window, { key: "Enter" });
}

const farmaciaProduct = {
  _id: "p-farmacia",
  id: "p-farmacia",
  name: "IBUPROFENO 400 X BLISTER",
  price: 4500,
  code: "BLST00001",
  quantity: 20,
  category: { name: "FARMACIA" },
};

const nonFarmaciaProduct = {
  _id: "p-alimento",
  id: "p-alimento",
  name: "Royal 15kg",
  price: 18400,
  code: "7791234567890",
  quantity: 10,
  category: { name: "Perros" },
};

describe("UnifiedPos — venta de pastillas sueltas de un blister (FARMACIA)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("muestra el switch 'Vender pastillas sueltas' cuando el producto escaneado es FARMACIA", async () => {
    mockFetchWith({ isScale: false, product: farmaciaProduct });
    renderPos({ addToCart: vi.fn() });

    scanCode("BLST00001");

    expect(await screen.findByText("IBUPROFENO 400 X BLISTER")).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: /vender pastillas sueltas/i }),
    ).toBeInTheDocument();
  });

  it("NO muestra el switch cuando la categoría no es FARMACIA", async () => {
    mockFetchWith({ isScale: false, product: nonFarmaciaProduct });
    renderPos({ addToCart: vi.fn() });

    scanCode("7791234567890");

    expect(await screen.findByText("Royal 15kg")).toBeInTheDocument();
    expect(
      screen.queryByRole("switch", { name: /vender pastillas sueltas/i }),
    ).not.toBeInTheDocument();
  });

  it("al activar el switch aparece el input 'Pastillas por blister'", async () => {
    mockFetchWith({ isScale: false, product: farmaciaProduct });
    renderPos({ addToCart: vi.fn() });

    scanCode("BLST00001");
    await screen.findByText("IBUPROFENO 400 X BLISTER");

    expect(screen.queryByLabelText(/pastillas por blister/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch", { name: /vender pastillas sueltas/i }));

    expect(screen.getByLabelText(/pastillas por blister/i)).toBeInTheDocument();
  });

  it("confirma con el switch activo: llama addToCart con POR_UNIDAD_BLISTER y piecesPerBlister", async () => {
    mockFetchWith({ isScale: false, product: farmaciaProduct });
    const addToCart = vi.fn();
    renderPos({ addToCart });

    scanCode("BLST00001");
    await screen.findByText("IBUPROFENO 400 X BLISTER");

    fireEvent.click(screen.getByRole("switch", { name: /vender pastillas sueltas/i }));
    fireEvent.change(screen.getByLabelText(/pastillas por blister/i), {
      target: { value: "7" },
    });
    // Cantidad de pastillas a vender: reusa el stepper existente (default 1).
    fireEvent.change(screen.getByLabelText("Cantidad"), { target: { value: "4" } });

    fireEvent.click(screen.getByRole("button", { name: "Agregar al pedido" }));

    expect(addToCart).toHaveBeenCalledTimes(1);
    expect(addToCart).toHaveBeenCalledWith(
      expect.objectContaining({ name: "IBUPROFENO 400 X BLISTER" }),
      4,
      "branch-1",
      20,
      "POR_UNIDAD_BLISTER",
      undefined,
      undefined,
      undefined,
      false,
      7,
    );
  });

  it("el botón de confirmar queda deshabilitado con el switch activo si piecesPerBlister no es válido", async () => {
    mockFetchWith({ isScale: false, product: farmaciaProduct });
    renderPos({ addToCart: vi.fn() });

    scanCode("BLST00001");
    await screen.findByText("IBUPROFENO 400 X BLISTER");

    fireEvent.click(screen.getByRole("switch", { name: /vender pastillas sueltas/i }));

    expect(screen.getByRole("button", { name: "Agregar al pedido" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/pastillas por blister/i), {
      target: { value: "1" },
    });
    expect(screen.getByRole("button", { name: "Agregar al pedido" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/pastillas por blister/i), {
      target: { value: "7" },
    });
    expect(screen.getByRole("button", { name: "Agregar al pedido" })).not.toBeDisabled();
  });

  it("muestra el precio por pastilla derivado en vivo (preview) al cargar piecesPerBlister", async () => {
    mockFetchWith({ isScale: false, product: farmaciaProduct });
    renderPos({ addToCart: vi.fn() });

    scanCode("BLST00001");
    await screen.findByText("IBUPROFENO 400 X BLISTER");

    fireEvent.click(screen.getByRole("switch", { name: /vender pastillas sueltas/i }));
    fireEvent.change(screen.getByLabelText(/pastillas por blister/i), {
      target: { value: "7" },
    });

    // ceil(4500/7 a $100) = 700; cantidad de pastillas por defecto = 1 (scanQty).
    await waitFor(() => {
      expect(screen.getByText("$700")).toBeInTheDocument();
    });
  });

  it("cancela con el switch activo sin llamar addToCart", async () => {
    mockFetchWith({ isScale: false, product: farmaciaProduct });
    const addToCart = vi.fn();
    renderPos({ addToCart });

    scanCode("BLST00001");
    await screen.findByText("IBUPROFENO 400 X BLISTER");
    fireEvent.click(screen.getByRole("switch", { name: /vender pastillas sueltas/i }));

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(addToCart).not.toHaveBeenCalled();
  });
});

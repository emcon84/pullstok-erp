import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

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
import { MemoryRouter } from "react-router-dom";
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
  render(
    <MemoryRouter>
      <UnifiedPos branchId="branch-1" />
    </MemoryRouter>,
  );
}

// Mockea el fetch global del handler de escaneo y resuelve con `payload`.
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

// Simula el patrón de la pistola USB HID: un run de dígitos + Enter.
function scanCode(code: string) {
  for (const d of code.split("")) {
    fireEvent.keyDown(window, { key: d });
  }
  fireEvent.keyDown(window, { key: "Enter" });
}

describe("UnifiedPos — POS unificado del vendedor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("muestra el título y las dos pestañas, arrancando en 'Por unidad'", () => {
    renderPos();

    expect(screen.getByRole("heading", { name: "Nueva venta" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Por unidad" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Suelto" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Por unidad" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("catalog-tab")).toBeInTheDocument();
    expect(screen.queryByTestId("loose-tab")).not.toBeInTheDocument();
  });

  it("cambia a la pestaña 'Suelto' y muestra la búsqueda de la planilla", () => {
    renderPos();

    fireEvent.click(screen.getByRole("button", { name: "Suelto" }));

    expect(screen.getByRole("button", { name: "Suelto" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("loose-tab")).toBeInTheDocument();
    expect(screen.queryByTestId("catalog-tab")).not.toBeInTheDocument();
  });

  it("muestra el panel de pedido siempre visible y refleja la cantidad del carrito", () => {
    renderPos({
      itemCount: 3,
      totalAmount: 5000,
      items: [{ productId: "p1" }],
    });

    expect(screen.getByTestId("order-panel")).toHaveTextContent("3");
  });

  it("con el carrito vacío el panel de pedido se muestra igualmente (sin FAB)", () => {
    renderPos();
    expect(screen.getByTestId("order-panel")).toHaveTextContent("0");
  });

  // ── Escaneo de la pistola: modal de confirmación para bolsas cerradas ──

  it("al escanear una bolsa cerrada abre el modal con producto y precio, y NO agrega directo", async () => {
    mockFetchWith({
      isScale: false,
      product: {
        _id: "p1",
        id: "p1",
        name: "Royal 15kg",
        price: 18400,
        code: "7791234567890",
        barcode: "7791234567890",
        quantity: 10,
        category: { name: "Perros" },
      },
    });
    const addToCart = vi.fn();
    renderPos({ addToCart });

    scanCode("7791234567890");

    expect(await screen.findByText("Royal 15kg")).toBeInTheDocument();
    expect(screen.getByText("$18.400")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agregar al pedido" })).toBeInTheDocument();
    expect(addToCart).not.toHaveBeenCalled();
  });

  it("al confirmar en el modal agrega la bolsa cerrada (BOLSA_CERRADA qty 1) y lo cierra", async () => {
    mockFetchWith({
      isScale: false,
      product: { _id: "p1", id: "p1", name: "Royal 15kg", price: 18400, code: "7791234567890", quantity: 10 },
    });
    const addToCart = vi.fn();
    renderPos({ addToCart });

    scanCode("7791234567890");
    const confirm = await screen.findByRole("button", { name: "Agregar al pedido" });
    fireEvent.click(confirm);

    expect(addToCart).toHaveBeenCalledTimes(1);
    expect(addToCart).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Royal 15kg", price: 18400, quantity: 0 }),
      1,
      "branch-1",
      10,
    );
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Agregar al pedido" })).not.toBeInTheDocument(),
    );
  });

  it("al cancelar el modal NO agrega la bolsa al pedido", async () => {
    mockFetchWith({
      isScale: false,
      product: { _id: "p1", id: "p1", name: "Royal 15kg", price: 18400, code: "7791234567890", quantity: 10 },
    });
    const addToCart = vi.fn();
    renderPos({ addToCart });

    scanCode("7791234567890");
    const cancel = await screen.findByRole("button", { name: "Cancelar" });
    fireEvent.click(cancel);

    expect(addToCart).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Cancelar" })).not.toBeInTheDocument(),
    );
  });

  it("al escanear una etiqueta de balanza agrega directo (POR_PESO) sin abrir el modal", async () => {
    mockFetchWith({
      isScale: true,
      scaleCode: "20",
      weightGram: 1500,
      weightKg: 1.5,
      cell: { id: "cell1", priceKg: 800, brandName: "Purina", typeName: "Gato", species: "felino" },
      looseName: "Purina · Gato",
      priceKg: 800,
      total: 1200,
    });
    const addToCart = vi.fn();
    renderPos({ addToCart });

    scanCode("201234567890");

    await waitFor(() => expect(addToCart).toHaveBeenCalledTimes(1));
    expect(addToCart).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Purina · Gato", price: 800 }),
      1.5,
      "branch-1",
      0,
      "POR_PESO",
      800,
      "cell1",
      "Purina · Gato",
    );
    expect(screen.queryByRole("button", { name: "Agregar al pedido" })).not.toBeInTheDocument();
  });
});

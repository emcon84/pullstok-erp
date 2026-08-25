import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

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
    session: null,
    loading: false,
    error: null,
    refetch: vi.fn(),
  } as never);
  render(<UnifiedPos branchId="branch-1" />);
}

describe("UnifiedPos — POS unificado del vendedor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});

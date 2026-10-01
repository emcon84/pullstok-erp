import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Venta libre: botón junto a "Producto manual" → diálogo (nombre + gramos +
// precio total) → cart.addFreeLine. No crea ningún producto en el server.
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
vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/services/productService", async (importActual) => ({
  ...(await importActual<typeof import("@/services/productService")>()),
  createManualProduct: vi.fn(),
}));

import { UnifiedPos } from "@/views/UnifiedPos";
import { useVendorCart } from "@/components/hooks/useVendorCart";
import { useVendorCheckout } from "@/components/hooks/useVendorCheckout";
import { useGetCurrentCashSession } from "@/components/hooks/useCashSession";
import { createManualProduct } from "@/services/productService";

function renderPos() {
  const cart = {
    items: [],
    totalAmount: 0,
    itemCount: 0,
    addToCart: vi.fn(),
    addFreeLine: vi.fn(),
    updateQuantity: vi.fn(),
    removeFromCart: vi.fn(),
    clearCart: vi.fn(),
  };
  vi.mocked(useVendorCart).mockReturnValue(cart as never);
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
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <UnifiedPos branchId="branch-1" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { cart };
}

const open = () => fireEvent.click(screen.getByRole("button", { name: /venta libre/i }));
const fill = (name: string, grams: string, total: string) => {
  fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: name } });
  fireEvent.change(screen.getByLabelText("Gramos"), { target: { value: grams } });
  fireEvent.change(screen.getByLabelText("Precio total"), { target: { value: total } });
};
const submit = () => fireEvent.click(screen.getByRole("button", { name: /agregar al pedido/i }));

describe("UnifiedPos — venta libre", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("muestra el botón 'Venta libre' junto a 'Producto manual' (ambas pestañas)", () => {
    renderPos();
    expect(screen.getByRole("button", { name: /venta libre/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /producto manual/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Suelto" }));
    expect(screen.getByRole("button", { name: /venta libre/i })).toBeInTheDocument();
  });

  it("agrega la línea con nombre, gramos y total tipeados, sin crear producto, y cierra", () => {
    const { cart } = renderPos();
    open();
    fill("Hueso molido", "350", "2800");
    submit();

    expect(cart.addFreeLine).toHaveBeenCalledTimes(1);
    expect(cart.addFreeLine).toHaveBeenCalledWith(
      { name: "Hueso molido", grams: 350, total: 2800 },
      "branch-1",
    );
    expect(createManualProduct).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: /venta libre/i })).not.toBeInTheDocument();
  });

  it("acepta el total en formato es-AR ('2.800,50')", () => {
    const { cart } = renderPos();
    open();
    fill("Hueso", "350", "2.800,50");
    submit();
    expect(cart.addFreeLine).toHaveBeenCalledWith(
      { name: "Hueso", grams: 350, total: 2800.5 },
      "branch-1",
    );
  });

  it.each([
    ["nombre vacío", "  ", "350", "2800", /nombre/i],
    ["gramos en 0", "Hueso", "0", "2800", /gramos/i],
    ["total en 0", "Hueso", "350", "0", /precio/i],
    ["total vacío", "Hueso", "350", "", /precio/i],
  ])("valida: %s → muestra error y no agrega", (_l, name, grams, total, msg) => {
    const { cart } = renderPos();
    open();
    fill(name, grams, total);
    submit();
    expect(screen.getByRole("alert")).toHaveTextContent(msg);
    expect(cart.addFreeLine).not.toHaveBeenCalled();
  });

  it("con el diálogo abierto, el capturador de la pistola NO intercepta lo tipeado", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderPos();
    open();
    for (const ch of "HUESOMOLIDO".split("")) fireEvent.keyDown(window, { key: ch });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes("by-scan"))).toHaveLength(0);
  });
});

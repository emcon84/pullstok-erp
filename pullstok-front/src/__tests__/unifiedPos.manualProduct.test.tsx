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
import { toast } from "react-toastify";

const createMock = vi.mocked(createManualProduct);

function renderPos() {
  const cart = {
    items: [],
    totalAmount: 0,
    itemCount: 0,
    addToCart: vi.fn(),
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
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <UnifiedPos branchId="branch-1" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { cart };
}

const openDialog = () =>
  fireEvent.click(screen.getByRole("button", { name: /producto manual/i }));

const fillAndSubmit = (name: string, price: string, qty = "1") => {
  fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: name } });
  fireEvent.change(screen.getByLabelText("Precio"), { target: { value: price } });
  fireEvent.change(screen.getByLabelText("Cantidad"), { target: { value: qty } });
  fireEvent.click(screen.getByRole("button", { name: /agregar al pedido/i }));
};

describe("UnifiedPos — producto manual", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("muestra el botón 'Producto manual' en ambas pestañas", () => {
    renderPos();
    expect(screen.getByRole("button", { name: /producto manual/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Suelto" }));
    expect(screen.getByRole("button", { name: /producto manual/i })).toBeInTheDocument();
  });

  it("no monta el diálogo hasta abrirlo", () => {
    renderPos();
    expect(screen.queryByRole("dialog", { name: /producto manual/i })).not.toBeInTheDocument();
    openDialog();
    expect(screen.getByRole("dialog", { name: /producto manual/i })).toBeInTheDocument();
  });

  it("al éxito suma una línea BOLSA_CERRADA con id/nombre/precio/cantidad devueltos y cierra", async () => {
    createMock.mockResolvedValue({
      id: "p-manual",
      name: "TORNILLO 5MM",
      price: "1500",
      quantity: 0,
      isManual: true,
      category: { id: "c1", name: "Carga manual" },
    } as never);
    const { cart } = renderPos();
    openDialog();
    fillAndSubmit("tornillo 5mm", "1500", "3");

    await waitFor(() => expect(cart.addToCart).toHaveBeenCalledTimes(1));
    expect(createMock).toHaveBeenCalledWith({ name: "tornillo 5mm", price: 1500 });
    const args = cart.addToCart.mock.calls[0];
    expect(args[0]).toMatchObject({
      _id: "p-manual",
      id: "p-manual",
      name: "TORNILLO 5MM",
      isManual: true,
    });
    expect(Number(args[0].price)).toBe(1500);
    expect(args[1]).toBe(3);
    expect(args[2]).toBe("branch-1");
    expect(args[3]).toBe(0);
    expect(args[4]).toBe("BOLSA_CERRADA");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: /producto manual/i })).not.toBeInTheDocument(),
    );
  });

  it("ante un error de la API muestra toast y NO agrega la línea", async () => {
    createMock.mockRejectedValue(new Error("Datos inválidos"));
    const { cart } = renderPos();
    openDialog();
    fillAndSubmit("tornillo", "1500");

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Datos inválidos"));
    expect(cart.addToCart).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: /producto manual/i })).toBeInTheDocument();
  });

  it("con el diálogo abierto, el capturador de la pistola NO intercepta lo tipeado", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderPos();
    openDialog();

    // Nombre tipeado rápido (< 400 ms entre teclas) + Enter: sin el guard se
    // tomaría como un escaneo (>= 6 caracteres alfanuméricos).
    for (const ch of "TORNILLO".split("")) fireEvent.keyDown(window, { key: ch });
    fireEvent.keyDown(window, { key: "Enter" });

    // (["me"] puede disparar otros fetch; lo que no debe pasar es /by-scan)
    const scanCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("by-scan"));
    expect(scanCalls).toHaveLength(0);
  });
});

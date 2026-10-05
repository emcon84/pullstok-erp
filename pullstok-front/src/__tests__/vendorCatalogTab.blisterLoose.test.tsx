import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { VendorCatalogTab } from "../components/organisms/VendorCatalogTab";
import { useVendorCatalog } from "../components/hooks/useVendorCatalog";
import { useVendorRowsKeyboard } from "../components/hooks/useVendorRowsKeyboard";
import {
  isFarmaciaProduct,
  isValidPiecesPerBlister,
} from "../components/hooks/vendorCatalogHelpers";
import type { DataItem } from "../types";

// Venta de pastillas sueltas desde el BUSCADOR del catálogo (mismo contrato que
// el modal de escaneo de UnifiedPos): para productos FARMACIA, confirmar la fila
// abre un diálogo con el switch "Vender pastillas sueltas".

vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("../components/hooks/useVendorCatalog", () => ({ useVendorCatalog: vi.fn() }));
vi.mock("../components/hooks/useVendorRowsKeyboard", () => ({
  useVendorRowsKeyboard: vi.fn(),
}));
vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock("../components/molecules/ProductDrawer", () => ({
  ProductDrawer: () => <div data-testid="product-drawer" />,
}));

const farmacia: DataItem = {
  _id: "p-farmacia",
  id: "p-farmacia",
  name: "IBUPROFENO 400 X BLISTER",
  code: "BLST00001",
  price: 4500,
  quantity: 0,
  category: { name: "FARMACIA" } as never,
  stocks: [{ quantity: 20 }],
};

const farmaciaStringCategory: DataItem = { ...farmacia, category: "FARMACIA" };

const alimento: DataItem = {
  _id: "p-alimento",
  name: "Royal 15kg",
  code: "R-15",
  price: 18400,
  quantity: 0,
  category: { name: "Perros" } as never,
  stocks: [{ quantity: 10 }],
};

describe("helpers — blister suelto", () => {
  it("isFarmaciaProduct acepta categoría objeto o string", () => {
    expect(isFarmaciaProduct(farmacia)).toBe(true);
    expect(isFarmaciaProduct(farmaciaStringCategory)).toBe(true);
    expect(isFarmaciaProduct(alimento)).toBe(false);
    expect(isFarmaciaProduct({ name: "x", price: 1, quantity: 0 })).toBe(false);
  });

  it("isValidPiecesPerBlister exige entero > 1", () => {
    expect(isValidPiecesPerBlister(7)).toBe(true);
    expect(isValidPiecesPerBlister(2)).toBe(true);
    expect(isValidPiecesPerBlister(1)).toBe(false);
    expect(isValidPiecesPerBlister(0)).toBe(false);
    expect(isValidPiecesPerBlister(2.5)).toBe(false);
  });
});

describe("VendorCatalogTab — pastillas sueltas desde el buscador (FARMACIA)", () => {
  const mockUseVendorCatalog = vi.mocked(useVendorCatalog);
  const mockKeyboard = vi.mocked(useVendorRowsKeyboard);
  const latest = () => mockKeyboard.mock.calls[mockKeyboard.mock.calls.length - 1][0];

  function renderTab(items: DataItem[], cartItems: unknown[] = []) {
    mockUseVendorCatalog.mockReturnValue({
      filter: "",
      setFilter: vi.fn(),
      categoryFilter: "",
      setCategoryFilter: vi.fn(),
      titleFilter: null,
      setTitleFilter: vi.fn(),
      onlyCarried: false,
      setOnlyCarried: vi.fn(),
      items,
      isLoadingInitial: false,
      isFetchingNextPage: false,
      hasNextPage: false,
      loadMore: vi.fn(),
      selectedIndex: 0,
      setSelectedIndex: vi.fn(),
      searchInputRef: { current: null },
      sentinelRef: { current: null },
      resetSelection: vi.fn(),
      registerRow: vi.fn(),
    } as never);
    const cart = {
      items: cartItems,
      totalAmount: 0,
      itemCount: 0,
      addToCart: vi.fn(),
      updateQuantity: vi.fn(),
      removeFromCart: vi.fn(),
      clearCart: vi.fn(),
    };
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <VendorCatalogTab
          branchId="b1"
          cart={cart as never}
          onSaveOrder={vi.fn()}
          onConfirmSale={vi.fn()}
          registerGridApi={vi.fn()}
        />
      </QueryClientProvider>,
    );
    return { cart };
  }

  beforeEach(() => vi.clearAllMocks());

  it("confirmar una fila FARMACIA abre el diálogo con el switch y NO agrega todavía", () => {
    const { cart } = renderTab([farmacia]);
    act(() => latest().onCommitRow());

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /vender pastillas sueltas/i })).toBeInTheDocument();
    expect(cart.addToCart).not.toHaveBeenCalled();
  });

  it("con el switch apagado agrega el blister entero igual que antes (BOLSA_CERRADA)", () => {
    const { cart } = renderTab([farmacia]);
    act(() => latest().onCommitRow());

    fireEvent.click(screen.getByRole("button", { name: "Agregar al pedido" }));

    expect(cart.addToCart).toHaveBeenCalledTimes(1);
    expect(cart.addToCart).toHaveBeenCalledWith(
      expect.objectContaining({ _id: "p-farmacia" }),
      1,
      "b1",
      20,
      "BOLSA_CERRADA",
      undefined,
      undefined,
      undefined,
      false,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("con el switch activo: addToCart POR_UNIDAD_BLISTER con piecesPerBlister (10º arg)", () => {
    const { cart } = renderTab([farmacia]);
    act(() => latest().onCommitRow());

    fireEvent.click(screen.getByRole("switch", { name: /vender pastillas sueltas/i }));
    fireEvent.change(screen.getByLabelText(/pastillas por blister/i), { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText("Cantidad"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar al pedido" }));

    expect(cart.addToCart).toHaveBeenCalledTimes(1);
    expect(cart.addToCart).toHaveBeenCalledWith(
      expect.objectContaining({ _id: "p-farmacia" }),
      4,
      "b1",
      20,
      "POR_UNIDAD_BLISTER",
      undefined,
      undefined,
      undefined,
      false,
      7,
    );
  });

  it("el botón queda deshabilitado con el switch activo si piecesPerBlister no es > 1", () => {
    renderTab([farmacia]);
    act(() => latest().onCommitRow());

    fireEvent.click(screen.getByRole("switch", { name: /vender pastillas sueltas/i }));
    expect(screen.getByRole("button", { name: "Agregar al pedido" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/pastillas por blister/i), { target: { value: "1" } });
    expect(screen.getByRole("button", { name: "Agregar al pedido" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/pastillas por blister/i), { target: { value: "7" } });
    expect(screen.getByRole("button", { name: "Agregar al pedido" })).not.toBeDisabled();
  });

  it("muestra el precio por pastilla derivado (ceil(4500/7 a $100) = $700)", () => {
    renderTab([farmacia]);
    act(() => latest().onCommitRow());

    fireEvent.click(screen.getByRole("switch", { name: /vender pastillas sueltas/i }));
    fireEvent.change(screen.getByLabelText(/pastillas por blister/i), { target: { value: "7" } });

    expect(screen.getByText("$700")).toBeInTheDocument();
  });

  it("Cancelar cierra el diálogo sin agregar", () => {
    const { cart } = renderTab([farmacia]);
    act(() => latest().onCommitRow());

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(cart.addToCart).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("también detecta FARMACIA cuando la categoría llega como string", () => {
    renderTab([farmaciaStringCategory]);
    act(() => latest().onCommitRow());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("un producto NO farmacia se agrega directo, sin diálogo (flujo intacto)", () => {
    const { cart } = renderTab([alimento]);
    act(() => latest().onCommitRow());

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(cart.addToCart).toHaveBeenCalledTimes(1);
    expect(cart.addToCart.mock.calls[0][4]).toBe("BOLSA_CERRADA");
  });

  it("Enter en el input de cantidad confirma el diálogo (teclado usable)", () => {
    const { cart } = renderTab([farmacia]);
    act(() => latest().onCommitRow());

    fireEvent.keyDown(screen.getByLabelText("Cantidad"), { key: "Enter" });

    expect(cart.addToCart).toHaveBeenCalledTimes(1);
  });

  describe("productos con presentaciones", () => {
    const blister = { id: "b", name: "Blister", factor: 10, price: 150, wholesalePrice: null, sortOrder: 0 };
    const withPresentations: DataItem = {
      ...farmacia,
      hasPresentations: true,
      presentations: [blister],
    };

    it("confirmar la fila abre el picker (no el diálogo de pastillas sueltas)", () => {
      renderTab([withPresentations]);
      act(() => latest().onCommitRow());
      expect(screen.getByRole("listbox")).toBeInTheDocument();
      expect(screen.queryByRole("switch", { name: /vender pastillas sueltas/i })).toBeNull();
    });

    it("elegir una presentación agrega la línea con la cantidad de la fila", () => {
      const { cart } = renderTab([withPresentations]);
      act(() => latest().onCommitRow());
      fireEvent.click(screen.getByRole("option", { name: /Blister/ }));
      expect(cart.addToCart).toHaveBeenCalledTimes(1);
      const args = cart.addToCart.mock.calls[0];
      expect(args[1]).toBe(1);
      expect(args[4]).toBe("BOLSA_CERRADA");
      expect(args[10]).toMatchObject({ id: "b" });
    });

    it("no bloquea por stock 0 (el picker decide) y respeta el stock en unidades base", () => {
      const noStock = { ...withPresentations, stocks: [{ quantity: 0 }] } as DataItem;
      renderTab([noStock]);
      act(() => latest().onCommitRow());
      expect(screen.getByRole("option", { name: /Blister/ })).toHaveAttribute("aria-disabled", "true");
    });

    it("bloquea cuando la línea del carrito ya consume el stock base", () => {
      const { cart } = renderTab(
        [{ ...withPresentations, stocks: [{ quantity: 20 }] } as DataItem],
        [{ productId: "p-farmacia", saleMode: "BOLSA_CERRADA", presentationId: "b", quantity: 2 }],
      );
      act(() => latest().onCommitRow());
      fireEvent.click(screen.getByRole("option", { name: /Blister/ }));
      expect(cart.addToCart).not.toHaveBeenCalled();
    });
  });
});

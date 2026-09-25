import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useVendorCart, type VendorCartItem } from "../components/hooks/useVendorCart";
import { CartItemRow } from "../components/molecules/CartItemRow";
import { ProductTable } from "../components/molecules/ProductTable";
import { VendorCatalogTab } from "../components/organisms/VendorCatalogTab";
import { useVendorCatalog } from "../components/hooks/useVendorCatalog";
import { useVendorRowsKeyboard } from "../components/hooks/useVendorRowsKeyboard";
import { toast } from "react-toastify";
import type { DataItem } from "../types";

// Productos MANUALES (isManual): tienen quantity 0 en la BD pero el server no
// valida ni descuenta stock, así que el carrito y el catálogo del POS no deben
// toparlos ni mostrarlos como "sin stock".

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

const manual: DataItem = {
  _id: "p-manual",
  id: "p-manual",
  name: "TORNILLO 5MM",
  code: "",
  price: "1500",
  quantity: 0,
  isManual: true,
  stocks: [{ quantity: 0 }],
};

const regularNoStock: DataItem = {
  _id: "p-regular",
  name: "BOLSA SIN STOCK",
  price: 4500,
  quantity: 0,
  stocks: [{ quantity: 0 }],
};

describe("useVendorCart — líneas manuales", () => {
  beforeEach(() => localStorage.clear());

  it("addToCart conserva isManual en la línea (stock 0)", () => {
    const { result } = renderHook(() => useVendorCart());
    act(() => result.current.addToCart(manual, 2, "b1", 0, "BOLSA_CERRADA"));

    const item = result.current.items[0];
    expect(item).toMatchObject({
      productId: "p-manual",
      name: "TORNILLO 5MM",
      price: 1500,
      quantity: 2,
      stock: 0,
      isManual: true,
      saleMode: "BOLSA_CERRADA",
    });
  });

  it("agregar de nuevo suma y mantiene isManual", () => {
    const { result } = renderHook(() => useVendorCart());
    act(() => result.current.addToCart(manual, 2, "b1", 0, "BOLSA_CERRADA"));
    act(() => result.current.addToCart(manual, 3, "b1", 0, "BOLSA_CERRADA"));

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].quantity).toBe(5);
    expect(result.current.items[0].isManual).toBe(true);
  });

  it("updateQuantity permite superar stock (0) sin topes", () => {
    const { result } = renderHook(() => useVendorCart());
    act(() => result.current.addToCart(manual, 1, "b1", 0, "BOLSA_CERRADA"));
    act(() => result.current.updateQuantity("p-manual", 40, "BOLSA_CERRADA"));

    expect(result.current.items[0].quantity).toBe(40);
  });

  it("un producto común no queda marcado como manual", () => {
    const { result } = renderHook(() => useVendorCart());
    act(() => result.current.addToCart(regularNoStock, 1, "b1", 5, "BOLSA_CERRADA"));
    expect(result.current.items[0].isManual).toBeFalsy();
  });
});

describe("CartItemRow — línea manual", () => {
  const line = (over: Partial<VendorCartItem> = {}): VendorCartItem => ({
    productId: "p-manual",
    name: "TORNILLO 5MM",
    code: "",
    price: 1500,
    stock: 0,
    quantity: 3,
    branchId: "b1",
    saleMode: "BOLSA_CERRADA",
    isManual: true,
    ...over,
  });

  it("mantiene + habilitado por encima de stock y sube la cantidad", () => {
    const onUpdateQty = vi.fn();
    render(<CartItemRow item={line()} onUpdateQty={onUpdateQty} onRemove={vi.fn()} />);
    const plus = screen.getByRole("button", { name: "Aumentar" }) as HTMLButtonElement;
    expect(plus.disabled).toBe(false);
    fireEvent.click(plus);
    expect(onUpdateQty).toHaveBeenCalledWith(4);
  });

  it("una línea común sin isManual sigue topeada por stock", () => {
    render(
      <CartItemRow
        item={line({ isManual: undefined, stock: 3, quantity: 3 })}
        onUpdateQty={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(
      (screen.getByRole("button", { name: "Aumentar" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});

describe("ProductTable — producto manual", () => {
  it("muestra 'Manual' en vez de 'Sin stock'", () => {
    render(
      <ProductTable
        items={[manual]}
        cartItems={[]}
        selectedIndex={0}
        registerRow={vi.fn()}
        onRowClick={vi.fn()}
        onOpenDrawer={vi.fn()}
        onAssignBarcode={vi.fn()}
      />,
    );
    expect(screen.queryByText("Sin stock")).not.toBeInTheDocument();
    expect(screen.getAllByText("Manual").length).toBeGreaterThanOrEqual(1);
  });

  it("un producto común sin stock sigue mostrando 'Sin stock'", () => {
    render(
      <ProductTable
        items={[regularNoStock]}
        cartItems={[]}
        selectedIndex={0}
        registerRow={vi.fn()}
        onOpenDrawer={vi.fn()}
        onRowClick={vi.fn()}
        onAssignBarcode={vi.fn()}
      />,
    );
    expect(screen.getAllByText("Sin stock").length).toBeGreaterThanOrEqual(1);
  });
});

describe("VendorCatalogTab — producto manual con quantity 0", () => {
  const mockUseVendorCatalog = vi.mocked(useVendorCatalog);
  const mockKeyboard = vi.mocked(useVendorRowsKeyboard);

  function renderTab(items: DataItem[]) {
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
      facetsCategories: [],
      facetsVariants: [],
      facetsTitles: [],
    } as never);
    const cart = {
      items: [],
      totalAmount: 0,
      itemCount: 0,
      addToCart: vi.fn(),
      updateQuantity: vi.fn(),
      removeFromCart: vi.fn(),
      clearCart: vi.fn(),
    };
    render(
      <QueryClientProvider client={new QueryClient()}>
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

  const qtyInputs = () =>
    Array.from(
      document.querySelectorAll<HTMLInputElement>('input[inputmode="numeric"]'),
    );

  beforeEach(() => vi.clearAllMocks());

  // El hook de teclado (mockeado) recibe las opciones más recientes en cada render.
  const latest = () => mockKeyboard.mock.calls[mockKeyboard.mock.calls.length - 1][0];

  it("Enter sobre la fila activa lo agrega al carrito sin toast de 'sin stock'", () => {
    const { cart } = renderTab([manual]);

    act(() => latest().onCommitRow());

    expect(toast.error).not.toHaveBeenCalled();
    expect(cart.addToCart).toHaveBeenCalledTimes(1);
    const args = cart.addToCart.mock.calls[0];
    expect(args[0]).toMatchObject({ _id: "p-manual", isManual: true });
    expect(args[1]).toBe(1);
    expect(args[2]).toBe("b1");
    expect(args[3]).toBe(0);
    expect(args[4]).toBe("BOLSA_CERRADA");
  });

  it("el atajo + puede subir la cantidad más allá de 0 (sin tope de stock)", () => {
    renderTab([manual]);
    act(() => latest().onIncrement());
    act(() => latest().onIncrement());
    expect(qtyInputs()[0].value).toBe("3");
  });

  it("un producto común sin stock sigue rechazado: toast y no se agrega", () => {
    const { cart } = renderTab([regularNoStock]);

    act(() => latest().onCommitRow());

    expect(toast.error).toHaveBeenCalledWith("Producto sin stock");
    expect(cart.addToCart).not.toHaveBeenCalled();
  });
});

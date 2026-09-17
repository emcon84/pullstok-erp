import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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
  // UnifiedPos lee ["me"] (precio mayorista) vía react-query — necesita un
  // QueryClientProvider en el árbol. retry:false para que el fetch fallido
  // (sin backend en el test) no reintente y ralentice la suite.
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
      "BOLSA_CERRADA",
      undefined,
      undefined,
      undefined,
      false, // sellsWholesale: sin sesión ["me"] en el test, default false
    );
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Agregar al pedido" })).not.toBeInTheDocument(),
    );
  });

  it("el modal trae la cantidad en 1 y el botón de confirmar enfocado (no el campo)", async () => {
    mockFetchWith({
      isScale: false,
      product: { _id: "p1", id: "p1", name: "Royal 15kg", price: 18400, code: "7791234567890", quantity: 10 },
    });
    renderPos({ addToCart: vi.fn() });

    scanCode("7791234567890");

    // El botón queda enfocado (no el input de cantidad): así seguir
    // escaneando con el modal abierto reemplaza el producto en vez de
    // filtrar los dígitos del código en el campo de cantidad.
    const confirmButton = await screen.findByRole("button", { name: "Agregar al pedido" });
    expect(confirmButton).toHaveFocus();
    expect(screen.getByLabelText("Cantidad")).toHaveValue("1");
  });

  it("edita la cantidad y confirma con Enter desde el campo (sin usar el mouse)", async () => {
    mockFetchWith({
      isScale: false,
      product: { _id: "p1", id: "p1", name: "Royal 15kg", price: 18400, code: "7791234567890", quantity: 10 },
    });
    const addToCart = vi.fn();
    renderPos({ addToCart });

    scanCode("7791234567890");
    const qtyInput = await screen.findByLabelText("Cantidad");

    fireEvent.change(qtyInput, { target: { value: "3" } });
    fireEvent.keyDown(qtyInput, { key: "Enter" });

    expect(addToCart).toHaveBeenCalledTimes(1);
    expect(addToCart).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Royal 15kg" }),
      3,
      "branch-1",
      10,
      "BOLSA_CERRADA",
      undefined,
      undefined,
      undefined,
      false,
    );
    await waitFor(() =>
      expect(screen.queryByLabelText("Cantidad")).not.toBeInTheDocument(),
    );
  });

  it("si dígitos de otro código se filtran al campo, la cantidad queda topeada al stock (no explota el total)", async () => {
    mockFetchWith({
      isScale: false,
      product: { _id: "p1", id: "p1", name: "Royal 15kg", price: 18400, code: "7791234567890", quantity: 10 },
    });
    const addToCart = vi.fn();
    renderPos({ addToCart });

    scanCode("7791234567890");
    const qtyInput = await screen.findByLabelText("Cantidad");

    // Simula el código de barras de un segundo producto filtrándose al campo.
    fireEvent.change(qtyInput, { target: { value: "8445290988027" } });
    expect(qtyInput).toHaveValue("10"); // clamp al stock (10), nunca el barcode

    fireEvent.keyDown(qtyInput, { key: "Enter" });
    expect(addToCart).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Royal 15kg" }),
      10,
      "branch-1",
      10,
      "BOLSA_CERRADA",
      undefined,
      undefined,
      undefined,
      false,
    );
  });

  it("escanear un segundo producto sin cerrar el modal reemplaza el contenido (comportamiento original)", async () => {
    // Ojo: UnifiedPos también dispara un fetch propio para ["me"] (precio
    // mayorista) — el stub tiene que responder por URL, no por orden de
    // llamada, para no confundir esa respuesta con la del escaneo.
    const byScanResponses: Record<string, unknown> = {
      "7791234567890": {
        isScale: false,
        product: { _id: "p1", id: "p1", name: "Royal 15kg", price: 18400, code: "7791234567890", quantity: 10 },
      },
      "1112223334445": {
        isScale: false,
        product: { _id: "p2", id: "p2", name: "Dog Chow 15kg", price: 15900, code: "1112223334445", quantity: 5 },
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        const code = Object.keys(byScanResponses).find((c) => url.includes(c));
        const payload = code ? byScanResponses[code] : {};
        return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve(payload) });
      }),
    );
    renderPos({ addToCart: vi.fn() });

    scanCode("7791234567890");
    await screen.findByText("Royal 15kg");

    scanCode("1112223334445");

    await waitFor(() => expect(screen.getByText("Dog Chow 15kg")).toBeInTheDocument());
    expect(screen.queryByText("Royal 15kg")).not.toBeInTheDocument();
    // La cantidad se resetea a 1 con el producto nuevo, no arrastra nada del anterior.
    expect(screen.getByLabelText("Cantidad")).toHaveValue("1");
  });

  it("escanear el mismo producto de nuevo con el modal abierto suma como conteo (no resetea)", async () => {
    mockFetchWith({
      isScale: false,
      product: { _id: "p1", id: "p1", name: "Royal 15kg", price: 18400, code: "7791234567890", quantity: 10 },
    });
    renderPos({ addToCart: vi.fn() });

    scanCode("7791234567890");
    await screen.findByText("Royal 15kg");
    expect(screen.getByLabelText("Cantidad")).toHaveValue("1");

    scanCode("7791234567890");
    await waitFor(() => expect(screen.getByLabelText("Cantidad")).toHaveValue("2"));

    scanCode("7791234567890");
    await waitFor(() => expect(screen.getByLabelText("Cantidad")).toHaveValue("3"));

    // Sigue siendo el mismo producto, no se re-abrió ni se duplicó el modal.
    expect(screen.getAllByText("Royal 15kg")).toHaveLength(1);
  });

  it("las teclas +/- del teclado ajustan la cantidad del modal", async () => {
    mockFetchWith({
      isScale: false,
      product: { _id: "p1", id: "p1", name: "Royal 15kg", price: 18400, code: "7791234567890", quantity: 10 },
    });
    renderPos({ addToCart: vi.fn() });

    scanCode("7791234567890");
    await screen.findByText("Royal 15kg");
    expect(screen.getByLabelText("Cantidad")).toHaveValue("1");

    fireEvent.keyDown(window, { key: "+" });
    expect(screen.getByLabelText("Cantidad")).toHaveValue("2");

    fireEvent.keyDown(window, { key: "+" });
    expect(screen.getByLabelText("Cantidad")).toHaveValue("3");

    fireEvent.keyDown(window, { key: "-" });
    expect(screen.getByLabelText("Cantidad")).toHaveValue("2");
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

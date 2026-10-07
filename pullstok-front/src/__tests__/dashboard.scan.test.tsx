import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("react-toastify", () => ({ toast: toastMock }));

const uiMode = vi.hoisted(() => ({ value: "OPERATIVO" as "OPERATIVO" | "ADMINISTRATIVO" }));
vi.mock("@/hooks/useUiMode", () => ({ useUiMode: () => uiMode.value }));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useSearchParams: () => [new URLSearchParams(), vi.fn()] };
});

vi.mock("@/components/hooks/useProducts", () => ({
  useProducts: vi.fn(),
  useProductFacets: vi.fn(),
}));
vi.mock("@/components/hooks/useSales", () => ({
  useGetSales: vi.fn(),
  useCreateSale: vi.fn(),
}));
vi.mock("@/components/hooks/useStockSummary", () => ({ useStockSummary: vi.fn() }));
vi.mock("@/components/hooks/useBudget", () => ({ useGetBudgets: vi.fn() }));
vi.mock("@/components/hooks/useOrder", () => ({ useOrders: vi.fn() }));

vi.mock("@/components/molecules/ProductsTable", () => ({
  ProductsTable: () => <div data-testid="products-table" />,
}));
vi.mock("@/components/molecules/ProductDrawer", () => ({
  ProductDrawer: ({
    open,
    product,
  }: {
    open: boolean;
    product: { name?: string; _id?: string } | null;
  }) => (
    <div data-testid="product-drawer" data-open={String(open)}>
      {open && product ? `drawer:${product.name}:${product._id}` : ""}
    </div>
  ),
}));
vi.mock("@/components/molecules/QuickPriceModal", () => ({
  QuickPriceModal: () => <div data-testid="quick-price" />,
}));
vi.mock("@/components/molecules/SalesDrawer", () => ({
  SalesDrawer: () => <div data-testid="sales-drawer" />,
}));
vi.mock("@/components/molecules/StatCard", () => ({
  StatCard: ({ title, onClick }: { title: string; onClick?: () => void }) => (
    <button onClick={onClick}>{`stat:${title}`}</button>
  ),
}));
vi.mock("@/components/molecules/GenericModal", () => ({ GenericModal: () => <div /> }));
vi.mock("@/components/molecules/GenericModal/ModalContentUploadCsv", () => ({
  ModalContentUploadCsv: () => <div />,
}));
vi.mock("@/components/molecules/PrintProductList", () => ({ PrintProductList: () => <div /> }));
vi.mock("@/components/molecules/SecoBarcodesReportDialog", () => ({
  SecoBarcodesReportDialog: () => <div />,
}));
vi.mock("@/components/atoms/loader", () => ({ Loader: () => <div data-testid="loader" /> }));
vi.mock("@/views/Statistics", () => ({ Statistics: () => <div data-testid="statistics" /> }));
vi.mock("@/views/UnifiedPos", () => ({ UnifiedPos: () => <div data-testid="unified-pos" /> }));
vi.mock("@/components/organisms/VendorChat", () => ({ VendorChatWidget: () => <div /> }));

import { Dashboard } from "@/views/Dashboard";
import { useProducts, useProductFacets } from "@/components/hooks/useProducts";
import { useGetSales, useCreateSale } from "@/components/hooks/useSales";
import { useStockSummary } from "@/components/hooks/useStockSummary";
import { useGetBudgets } from "@/components/hooks/useBudget";
import { useOrders } from "@/components/hooks/useOrder";

const listProducts = [
  { _id: "p1", name: "Alimento Listado", price: 100, quantity: 3, stocks: [{ quantity: 3 }] },
];

const fetchMock = vi.fn();

function mockScanResponse(body: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  });
}

// Ráfaga de pistola (gap < 60 ms) + Enter, con timers reales.
async function scan(code: string) {
  const fire = (key: string) => fireEvent.keyDown(window, { key });
  for (const ch of code) {
    fire(ch);
    await new Promise((r) => setTimeout(r, 5));
  }
  fire("Enter");
}

function renderDashboard(user: object = { role: "ADMIN", branchIds: [] }) {
  localStorage.setItem("user", JSON.stringify(user));
  localStorage.setItem("token", "tok");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Dashboard />
    </QueryClientProvider>,
  );
}

describe("Dashboard admin — escaneo abre el producto", () => {
  beforeEach(() => {
    localStorage.clear();
    uiMode.value = "OPERATIVO";
    vi.clearAllMocks();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(useProducts).mockReturnValue({
      products: listProducts,
      loading: false,
      error: null,
    } as never);
    vi.mocked(useProductFacets).mockReturnValue({
      titles: [],
      categories: [],
      variants: [],
    } as never);
    vi.mocked(useGetSales).mockReturnValue({ sales: [], loading: false } as never);
    vi.mocked(useCreateSale).mockReturnValue({ createSale: vi.fn() } as never);
    vi.mocked(useStockSummary).mockReturnValue({
      summary: { branches: [] },
      error: null,
    } as never);
    vi.mocked(useGetBudgets).mockReturnValue({ budgets: [], loading: false } as never);
    vi.mocked(useOrders).mockReturnValue({ orders: [], loading: false } as never);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("escanear un código válido abre el modal con el producto y pide by-scan con el token", async () => {
    mockScanResponse({
      product: { id: "p1", name: "Alimento Escaneado", price: 500, barcode: "7790001234567" },
    });
    renderDashboard();
    await scan("7790001234567");
    expect(await screen.findByText("Alimento Escaneado")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/products/by-scan/7790001234567");
    expect(init.headers.Authorization).toBe("Bearer tok");
  });

  it("Editar cierra el modal y abre el ProductDrawer con el producto del listado", async () => {
    mockScanResponse({ product: { id: "p1", name: "Alimento Escaneado", price: 500 } });
    renderDashboard();
    await scan("7790001234567");
    fireEvent.click(await screen.findByRole("button", { name: /Editar/ }));
    await waitFor(() =>
      expect(screen.getByTestId("product-drawer")).toHaveAttribute("data-open", "true"),
    );
    // Usa el objeto del listado (misma forma que ProductsTable pasa a onEdit).
    expect(screen.getByTestId("product-drawer")).toHaveTextContent(
      "drawer:Alimento Listado:p1",
    );
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Editar/ })).not.toBeInTheDocument(),
    );
  });

  it("si el producto no está en el listado, abre el drawer con el escaneado (id -> _id)", async () => {
    mockScanResponse({ product: { id: "zzz", name: "Fuera de Lista", price: 5 } });
    renderDashboard();
    await scan("7790001234567");
    fireEvent.click(await screen.findByRole("button", { name: /Editar/ }));
    await waitFor(() =>
      expect(screen.getByTestId("product-drawer")).toHaveTextContent(
        "drawer:Fuera de Lista:zzz",
      ),
    );
  });

  it("404 abre el diálogo Vincular código con el código escaneado y sin toast de error", async () => {
    mockScanResponse({}, 404);
    renderDashboard();
    await scan("0000000000000");
    expect(await screen.findByText("Vincular código")).toBeInTheDocument();
    expect(screen.getByText("0000000000000")).toBeInTheDocument();
    expect(toastMock.error).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Editar/ })).not.toBeInTheDocument();
  });

  it("mientras Vincular código está abierto no se captura otro escaneo", async () => {
    mockScanResponse({}, 404);
    renderDashboard();
    await scan("0000000000000");
    await screen.findByText("Vincular código");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 450));
    });
    await scan("1111111111");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("asignar el código cierra el diálogo", async () => {
    mockScanResponse({}, 404);
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => [{ id: "p1", name: "Alimento Listado", code: "A1" }] })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: "p1", name: "Alimento Listado" }) });
    renderDashboard();
    await scan("0000000000000");
    await screen.findByText("Vincular código");
    fireEvent.change(screen.getByPlaceholderText(/Buscá el producto por nombre/), {
      target: { value: "alimento" },
    });
    fireEvent.click(await screen.findByText("Alimento Listado"));
    await waitFor(() => expect(screen.queryByText("Vincular código")).not.toBeInTheDocument());
    expect(toastMock.success).toHaveBeenCalledWith("¡Código asignado!");
  });

  it("etiqueta de balanza (isScale) -> toast.info con looseName, sin modal", async () => {
    mockScanResponse({
      isScale: true,
      looseName: "Dog Chow · Adulto",
      weightKg: 1.2,
      cell: { id: "c1" },
    });
    renderDashboard();
    await scan("2012345012345");
    await waitFor(() => expect(toastMock.info).toHaveBeenCalled());
    expect(toastMock.info.mock.calls[0][0]).toContain("Dog Chow · Adulto");
    expect(screen.queryByRole("button", { name: /Editar/ })).not.toBeInTheDocument();
  });

  it("un segundo escaneo de otro producto reemplaza el modal", async () => {
    mockScanResponse({ product: { id: "a", name: "Producto A", price: 1 } });
    mockScanResponse({ product: { id: "b", name: "Producto B", price: 2 } });
    renderDashboard();
    await scan("1111111111");
    await screen.findByText("Producto A");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 450));
    });
    await scan("2222222222");
    expect(await screen.findByText("Producto B")).toBeInTheDocument();
    expect(screen.queryByText("Producto A")).not.toBeInTheDocument();
  });

  it("no captura mientras el drawer de producto está abierto", async () => {
    renderDashboard();
    fireEvent.click(screen.getByRole("button", { name: /Agregar producto/ }));
    await scan("7790001234567");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("vendedor (single branch): no hay capturador del admin", async () => {
    renderDashboard({ role: "VENDEDOR", branchIds: ["b1"] });
    expect(screen.getByTestId("unified-pos")).toBeInTheDocument();
    await scan("7790001234567");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("modo ADMINISTRATIVO: un usuario de una sola sucursal ve el listado y el escaneo funciona", async () => {
    uiMode.value = "ADMINISTRATIVO";
    mockScanResponse({ product: { id: "p1", name: "Alimento Escaneado", price: 500 } });
    renderDashboard({ role: "VENDEDOR", branchIds: ["b1"] });
    expect(screen.queryByTestId("unified-pos")).not.toBeInTheDocument();
    await scan("7790001234567");
    expect(await screen.findByText("Alimento Escaneado")).toBeInTheDocument();
  });

  it("no captura mientras se muestra la vista de estadísticas", async () => {
    renderDashboard();
    fireEvent.click(screen.getByRole("button", { name: "stat:Ventas" }));
    expect(await screen.findByTestId("statistics")).toBeInTheDocument();
    await scan("7790001234567");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

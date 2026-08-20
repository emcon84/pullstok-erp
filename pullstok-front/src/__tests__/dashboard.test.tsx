import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
  };
});

vi.mock("@/components/hooks/useProducts", () => ({
  useProducts: vi.fn(),
  useProductFacets: vi.fn(),
}));
vi.mock("@/components/hooks/useSales", () => ({
  useGetSales: vi.fn(),
  useCreateSale: vi.fn(),
}));
vi.mock("@/components/hooks/useStockSummary", () => ({
  useStockSummary: vi.fn(),
}));
vi.mock("@/components/hooks/useBudget", () => ({
  useGetBudgets: vi.fn(),
}));
vi.mock("@/components/hooks/useOrder", () => ({
  useOrders: vi.fn(),
}));

vi.mock("@/components/molecules/ProductsTable", () => ({
  ProductsTable: ({ products }: { products: Array<{ name: string }> }) => (
    <div data-testid="products-table">
      {products.map((p) => p.name).join(" | ")}
    </div>
  ),
}));
vi.mock("@/components/molecules/ProductDrawer", () => ({
  ProductDrawer: () => <div data-testid="product-drawer" />,
}));
vi.mock("@/components/molecules/QuickPriceModal", () => ({
  QuickPriceModal: () => <div data-testid="quick-price" />,
}));
vi.mock("@/components/molecules/SalesDrawer", () => ({
  SalesDrawer: () => <div data-testid="sales-drawer" />,
}));
vi.mock("@/components/molecules/StatCard", () => ({
  StatCard: () => <div data-testid="stat-card" />,
}));
vi.mock("@/components/molecules/GenericModal", () => ({
  GenericModal: () => <div data-testid="generic-modal" />,
}));
vi.mock("@/components/molecules/GenericModal/ModalContentUploadCsv", () => ({
  ModalContentUploadCsv: () => <div data-testid="upload-csv" />,
}));
vi.mock("@/components/molecules/PrintProductList", () => ({
  PrintProductList: () => <div data-testid="print-list" />,
}));
vi.mock("@/components/atoms/loader", () => ({
  Loader: () => <div data-testid="loader" />,
}));
vi.mock("@/views/Statistics", () => ({
  Statistics: () => <div data-testid="statistics" />,
}));
vi.mock("@/views/VendorDashboard", () => ({
  VendorDashboard: () => <div data-testid="vendor-dashboard" />,
}));

import { Dashboard } from "@/views/Dashboard";
import { useProducts, useProductFacets } from "@/components/hooks/useProducts";
import { useGetSales, useCreateSale } from "@/components/hooks/useSales";
import { useStockSummary } from "@/components/hooks/useStockSummary";
import { useGetBudgets } from "@/components/hooks/useBudget";
import { useOrders } from "@/components/hooks/useOrder";

const mockUseProducts = vi.mocked(useProducts);
const mockUseProductFacets = vi.mocked(useProductFacets);
const mockUseGetSales = vi.mocked(useGetSales);
const mockUseCreateSale = vi.mocked(useCreateSale);
const mockUseStockSummary = vi.mocked(useStockSummary);
const mockUseGetBudgets = vi.mocked(useGetBudgets);
const mockUseOrders = vi.mocked(useOrders);

const SIEGER_KEY = "SIEGER|SUPER PREMIUM PARA PERROS|SIEGER PUPPY";
const MAXXIUM_KEY = "MAXXIUM|MAXXIUM PERROS";

const products = [
  {
    _id: "p1",
    name: "Puppy A",
    price: 100,
    quantity: 1,
    provider: { name: "ALICAN" },
    planSection: { brand: "SIEGER", line: "SUPER PREMIUM PARA PERROS", subline: "SIEGER PUPPY", position: 1 },
  },
  {
    _id: "p2",
    name: "Perros 15kg",
    price: 100,
    quantity: 1,
    provider: { name: "ALICAN" },
    planSection: { brand: "MAXXIUM", line: null, subline: "MAXXIUM PERROS", position: 2 },
  },
  { _id: "p3", name: "Collar Suelto", price: 100, quantity: 1, provider: { name: "ALICAN" }, planSection: null },
];

function renderDashboard() {
  localStorage.setItem("user", JSON.stringify({ role: "admin", branchIds: [] }));
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <Dashboard />
    </QueryClientProvider>,
  );
}

function clickPill(text: string) {
  const el = screen
    .getAllByText(text)
    .find((n) => n.className.includes("cursor-pointer"));
  if (!el) throw new Error(`pill ${text} not found`);
  fireEvent.click(el);
}

// Elige una opción en el Select de proveedor (shadcn/radix): click en el
// trigger (combobox) y luego en la opción visible.
async function selectProvider(name: string) {
  fireEvent.click(screen.getByRole("combobox"));
  fireEvent.click(await screen.findByText(name));
}

describe("Dashboard — filtro client-side por título de planilla", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockUseProducts.mockReturnValue({
      products,
      loading: false,
      error: null,
    } as never);
    mockUseProductFacets.mockReturnValue({
      titles: [
        { key: SIEGER_KEY, label: "SIEGER PUPPY", count: 1 },
        { key: MAXXIUM_KEY, label: "MAXXIUM PERROS", count: 1 },
      ],
      categories: [],
      variants: [],
    } as never);
    mockUseGetSales.mockReturnValue({ sales: [], loading: false } as never);
    mockUseCreateSale.mockReturnValue({ createSale: vi.fn() } as never);
    mockUseStockSummary.mockReturnValue({
      summary: { branches: [] },
      loading: false,
      error: null,
    } as never);
    mockUseGetBudgets.mockReturnValue({ budgets: [], loading: false } as never);
    mockUseOrders.mockReturnValue({ orders: [], loading: false } as never);
  });

  it("sin proveedor ALICAN no muestra ni el selector de tipo ni los títulos", async () => {
    renderDashboard();

    expect(screen.queryByText("Tipo")).not.toBeInTheDocument();
    expect(screen.queryByText("Todos")).not.toBeInTheDocument();
    expect(screen.queryByText("Títulos")).not.toBeInTheDocument();
    expect(screen.queryByText("SECO")).not.toBeInTheDocument();
    expect(screen.queryByText("WET")).not.toBeInTheDocument();
  });

  it("al elegir ALICAN aparecen el selector de tipo (etiqueta Tipo) y los títulos", async () => {
    renderDashboard();

    await selectProvider("ALICAN");

    expect(screen.getByText("Tipo")).toBeInTheDocument();
    expect(screen.getByText("Todos")).toBeInTheDocument();
    expect(screen.getByText("SECO")).toBeInTheDocument();
    expect(screen.getByText("WET")).toBeInTheDocument();
    expect(screen.getByText("Títulos")).toBeInTheDocument();
    expect(screen.getByText("SIEGER PUPPY (1)")).toBeInTheDocument();
    expect(screen.getByText("MAXXIUM PERROS (1)")).toBeInTheDocument();
  });

  it("al salir de ALICAN se ocultan los filtros específicos", async () => {
    renderDashboard();

    await selectProvider("ALICAN");
    expect(screen.getByText("Tipo")).toBeInTheDocument();

    await selectProvider("Todos los proveedores");

    expect(screen.queryByText("Tipo")).not.toBeInTheDocument();
    expect(screen.queryByText("Títulos")).not.toBeInTheDocument();
  });

  it("renderiza los chips de títulos desde las facets (client-side)", async () => {
    renderDashboard();
    await selectProvider("ALICAN");

    expect(screen.getByText("Títulos")).toBeInTheDocument();
    expect(screen.getByText("SIEGER PUPPY (1)")).toBeInTheDocument();
    expect(screen.getByText("MAXXIUM PERROS (1)")).toBeInTheDocument();
  });

  it("elegir un título filtra por la clave compuesta [brand, line, subline]", async () => {
    renderDashboard();
    await selectProvider("ALICAN");
    expect(screen.getByTestId("products-table").textContent).toContain(
      "Collar Suelto",
    );

    clickPill("SIEGER PUPPY (1)");

    const table = screen.getByTestId("products-table");
    expect(table.textContent).toBe("Puppy A");
    expect(table.textContent).not.toContain("Perros 15kg");
    expect(table.textContent).not.toContain("Collar Suelto");
  });

  it("toggle del título activo lo deselecciona y restaura la lista completa", async () => {
    renderDashboard();
    await selectProvider("ALICAN");

    clickPill("MAXXIUM PERROS (1)");
    expect(screen.getByTestId("products-table").textContent).toBe("Perros 15kg");

    clickPill("MAXXIUM PERROS (1)");
    expect(screen.getByTestId("products-table").textContent).toContain(
      "Puppy A",
    );
    expect(screen.getByTestId("products-table").textContent).toContain(
      "Collar Suelto",
    );
  });
});

describe("Dashboard — selector de tipo de planilla ALICAN (SECO/WET)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockUseProducts.mockReturnValue({
      products,
      loading: false,
      error: null,
    } as never);
    mockUseProductFacets.mockReturnValue({
      titles: [
        { key: SIEGER_KEY, label: "SIEGER PUPPY", count: 1 },
        { key: MAXXIUM_KEY, label: "MAXXIUM PERROS", count: 1 },
      ],
      categories: [],
      variants: [],
    } as never);
    mockUseGetSales.mockReturnValue({ sales: [], loading: false } as never);
    mockUseCreateSale.mockReturnValue({ createSale: vi.fn() } as never);
    mockUseStockSummary.mockReturnValue({
      summary: { branches: [] },
      loading: false,
      error: null,
    } as never);
    mockUseGetBudgets.mockReturnValue({ budgets: [], loading: false } as never);
    mockUseOrders.mockReturnValue({ orders: [], loading: false } as never);
  });

  it("renderiza el selector con Todos/SECO/WET al elegir ALICAN", async () => {
    renderDashboard();
    await selectProvider("ALICAN");

    expect(screen.getByText("Tipo")).toBeInTheDocument();
    expect(screen.getByText("Todos")).toBeInTheDocument();
    expect(screen.getByText("SECO")).toBeInTheDocument();
    expect(screen.getByText("WET")).toBeInTheDocument();
  });

  it("cambiar a WET limpia el título activo y pasa priceListType=WET a los hooks", async () => {
    renderDashboard();
    await selectProvider("ALICAN");

    // Primero se elige un título (filtro client-side activo).
    clickPill("SIEGER PUPPY (1)");
    expect(screen.getByTestId("products-table").textContent).toBe("Puppy A");

    clickPill("WET");

    // El filtro por título se limpió al cambiar de tipo → lista completa.
    expect(screen.getByTestId("products-table").textContent).toBe(
      "Puppy A | Perros 15kg | Collar Suelto",
    );
    expect(mockUseProducts).toHaveBeenLastCalledWith(
      undefined,
      undefined,
      undefined,
      "WET",
    );
    expect(mockUseProductFacets).toHaveBeenLastCalledWith(undefined, "WET");
  });

  it("volver a Todos quita el priceListType (undefined) de los hooks", async () => {
    renderDashboard();
    await selectProvider("ALICAN");

    clickPill("WET");
    clickPill("Todos");

    expect(mockUseProducts).toHaveBeenLastCalledWith(
      undefined,
      undefined,
      undefined,
      undefined,
    );
    expect(mockUseProductFacets).toHaveBeenLastCalledWith(undefined, undefined);
  });
});

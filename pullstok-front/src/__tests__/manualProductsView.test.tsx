import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Vista admin "Carga manual": lista, vacío, carga, error, guard de rol y
// apertura del diálogo "Agregar al sistema".
const { state, mockRefetch } = vi.hoisted(() => ({
  state: {
    products: [] as unknown[],
    loading: false,
    error: null as Error | null,
  },
  mockRefetch: vi.fn(),
}));

vi.mock("@/components/hooks/useManualProducts", () => ({
  useManualProducts: () => ({
    products: state.products,
    loading: state.loading,
    error: state.error,
    refetch: mockRefetch,
  }),
}));
vi.mock("@/components/molecules/PromoteManualProductDialog", () => ({
  PromoteManualProductDialog: ({ product }: { product: { name: string } | null }) =>
    product ? <div data-testid="promote-dialog">{product.name}</div> : null,
}));
vi.mock("@/services/onboardingService", () => ({
  getMe: vi.fn(),
}));

import { ManualProducts } from "@/views/ManualProducts";
import { getMe } from "@/services/onboardingService";

const mockGetMe = vi.mocked(getMe);

const rows = [
  { id: "p1", name: "TORNILLO", price: 1500, quantity: 0, isManual: true, categoryId: "cm", category: { id: "cm", name: "Carga manual" } },
  { id: "p2", name: "TUERCA", price: 300, quantity: 0, isManual: true, categoryId: "cm", category: { id: "cm", name: "Carga manual" } },
];

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/carga-manual"]}>
        <Routes>
          <Route path="/carga-manual" element={<ManualProducts />} />
          <Route path="/dashboard" element={<div>DASHBOARD</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ManualProducts (vista admin)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.products = rows;
    state.loading = false;
    state.error = null;
    mockGetMe.mockResolvedValue({ role: "ADMIN" } as never);
  });

  it("lista los productos manuales con nombre, precio y cuántos hay pendientes", async () => {
    renderView();

    expect(await screen.findByText("TORNILLO")).toBeInTheDocument();
    expect(screen.getByText("TUERCA")).toBeInTheDocument();
    expect(screen.getByText(/1\.500/)).toBeInTheDocument();
    expect(screen.getByText(/2 pendientes/)).toBeInTheDocument();
  });

  it("singular cuando hay un solo pendiente", async () => {
    state.products = [rows[0]];
    renderView();

    expect(await screen.findByText(/1 pendiente\b/)).toBeInTheDocument();
  });

  it("muestra el estado vacío cuando no hay productos", async () => {
    state.products = [];
    renderView();

    expect(await screen.findByText(/No hay productos pendientes/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Agregar al sistema/ })).not.toBeInTheDocument();
  });

  it("muestra el estado de carga sin lista ni vacío", async () => {
    state.products = [];
    state.loading = true;
    renderView();

    expect(await screen.findByRole("status")).toBeInTheDocument();
    expect(screen.queryByText(/No hay productos pendientes/)).not.toBeInTheDocument();
  });

  it("muestra el error con el mensaje y permite reintentar", async () => {
    state.products = [];
    state.error = new Error("Sin permiso");
    renderView();

    expect(await screen.findByText("Sin permiso")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(mockRefetch).toHaveBeenCalled();
  });

  it("'Agregar al sistema' abre el diálogo con el producto de esa fila", async () => {
    renderView();
    await screen.findByText("TUERCA");

    const buttons = screen.getAllByRole("button", { name: /Agregar al sistema/ });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1]);

    expect(screen.getByTestId("promote-dialog")).toHaveTextContent("TUERCA");
  });

  it("MANAGEMENT también puede ver la vista", async () => {
    mockGetMe.mockResolvedValue({ role: "MANAGEMENT" } as never);
    renderView();

    expect(await screen.findByText("TORNILLO")).toBeInTheDocument();
  });

  it("un rol sin acceso (VENDEDOR) vuelve al dashboard", async () => {
    mockGetMe.mockResolvedValue({ role: "VENDEDOR" } as never);
    renderView();

    expect(await screen.findByText("DASHBOARD")).toBeInTheDocument();
    expect(screen.queryByText("TORNILLO")).not.toBeInTheDocument();
  });
});

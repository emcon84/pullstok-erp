import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// Hoisted mocks — the scanner page depends on device APIs (camera, audio) and
// on hooks; we stub the hooks and the drawer, and mock fetch for the product
// lookup so the tests focus on the branch-aware stock contract (spec F2).
// ---------------------------------------------------------------------------
vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/components/hooks/useProductStock", () => ({
  useProductStock: vi.fn(),
}));

vi.mock("@/components/hooks/useBranches", () => ({
  useBranches: vi.fn(),
}));

vi.mock("@/components/molecules/ProductDrawer", () => ({
  ProductDrawer: (props: { product?: { name?: string; quantity?: number } | null }) => (
    <div data-testid="dup-drawer">
      {props.product ? `${props.product.name}|qty:${props.product.quantity}` : "empty"}
    </div>
  ),
}));

import { StockScannerPage } from "@/views/StockScannerPage";
import { useProductStock } from "@/components/hooks/useProductStock";
import { useBranches } from "@/components/hooks/useBranches";

const mockUseProductStock = vi.mocked(useProductStock);
const mockUseBranches = vi.mocked(useBranches);
const mockUpdateBranchStock = vi.fn();
const fetchMock = vi.fn();

function setLoggedUser(role: string, branchIds?: string[]) {
  localStorage.setItem("user", JSON.stringify({ role, branchIds: branchIds ?? [] }));
}

function renderScanner() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <StockScannerPage />
    </QueryClientProvider>,
  );
}

/** Loads a product through the manual-code input (Enter key). */
async function loadProduct(barcode = "779123") {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      id: "p1",
      name: "Collar de Cuero",
      code: "SKU-1",
      barcode,
      price: 1500,
      quantity: 5,
      description: null,
      category: null,
    }),
  });
  fireEvent.change(screen.getByPlaceholderText(/escribí el código/i), {
    target: { value: barcode },
  });
  fireEvent.keyDown(screen.getByPlaceholderText(/escribí el código/i), {
    key: "Enter",
  });
  await screen.findByText("Collar de Cuero");
}

const stockResponse = {
  productId: "p1",
  branches: [
    { branchId: "b1", branchName: "Sucursal 1", quantity: 5, isHeadquarters: false, canEdit: true },
    { branchId: "hq", branchName: "Casa Central", quantity: 12, isHeadquarters: true, canEdit: true },
  ],
};

function mockStockWithBranchStock(mock: ReturnType<typeof vi.fn>) {
  mockUseProductStock.mockReturnValue({
    stock: stockResponse,
    loading: false,
    error: null,
    updateBranchStock: mock,
    updating: false,
  });
}

describe("StockScannerPage — stock por sucursal (spec F2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    mockUpdateBranchStock.mockResolvedValue({ branchId: "b1", quantity: 6 });
    mockUseBranches.mockReturnValue({
      branches: [
        { id: "hq", name: "Casa Central", isActive: true, createdAt: "" },
        { id: "b1", name: "Sucursal 1", isActive: true, createdAt: "" },
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it("adjusts the stock of the user's single assigned branch (VENDEDOR)", async () => {
    setLoggedUser("VENDEDOR", ["b1"]);
    mockStockWithBranchStock(mockUpdateBranchStock);
    renderScanner();
    await loadProduct();

    // The card shows the effective branch stock, not the global legacy value.
    expect(screen.getByText(/Stock · Sucursal 1/)).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.queryByText("Solo lectura")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Aumentar stock" }));

    await waitFor(() =>
      expect(mockUpdateBranchStock).toHaveBeenCalledWith({
        branchId: "b1",
        quantity: 6,
      }),
    );
  });

  it("hides the edit controls and shows read-only for a user without assignments", async () => {
    setLoggedUser("VENDEDOR", []);
    mockStockWithBranchStock(mockUpdateBranchStock);
    renderScanner();
    await loadProduct();

    expect(screen.getByText("Solo lectura")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aumentar stock" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Disminuir stock" })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/cantidad/i)).not.toBeInTheDocument();
  });

  it("offers an ADMIN/MANAGEMENT a branch selector backed by useBranches", async () => {
    setLoggedUser("ADMIN");
    mockStockWithBranchStock(mockUpdateBranchStock);
    renderScanner();
    await loadProduct();

    // Selector visible with the org branches; the selected branch feeds the stock row.
    fireEvent.click(await screen.findByRole("combobox", { name: /sucursal de trabajo/i }));
    expect(await screen.findByRole("option", { name: "Sucursal 1" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Casa Central" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("option", { name: "Casa Central" }));
    fireEvent.click(screen.getByRole("button", { name: "Aumentar stock" }));

    await waitFor(() =>
      expect(mockUpdateBranchStock).toHaveBeenCalledWith({
        branchId: "hq",
        quantity: 13,
      }),
    );
  });

  it("never sends the global quantity PUT: editing a non-HQ branch updates only that branch", async () => {
    setLoggedUser("VENDEDOR", ["b1"]);
    mockStockWithBranchStock(mockUpdateBranchStock);
    renderScanner();
    await loadProduct();

    fireEvent.click(screen.getByRole("button", { name: "Disminuir stock" }));

    await waitFor(() =>
      expect(mockUpdateBranchStock).toHaveBeenCalledWith({
        branchId: "b1",
        quantity: 4,
      }),
    );
    const fetchCalls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(fetchCalls.some((u: string) => u.includes("/products/p1"))).toBe(false);
  });

  it("preserves the duplicate flow: the drawer opens seeded with the global quantity", async () => {
    setLoggedUser("VENDEDOR", ["b1"]);
    mockStockWithBranchStock(mockUpdateBranchStock);
    renderScanner();

    // Unknown barcode → assign panel opens; search returns a match.
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ message: "not found" }),
    });
    fireEvent.change(screen.getByPlaceholderText(/escribí el código/i), {
      target: { value: "999000" },
    });
    fireEvent.keyDown(screen.getByPlaceholderText(/escribí el código/i), {
      key: "Enter",
    });
    await screen.findByText("No está asociado a ningún producto");

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: "p9", name: "Anillo de Plata", price: 800, quantity: 7, category: null },
      ],
    });
    fireEvent.change(screen.getByPlaceholderText(/buscá el producto/i), {
      target: { value: "anillo" },
    });

    fireEvent.click(await screen.findByTitle("Duplicar producto y editar antes de asignar"));

    expect(screen.getByTestId("dup-drawer")).toHaveTextContent("Anillo de Plata|qty:7");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ---------------------------------------------------------------------------
// T5 (odd/tasks/product-search-offline-realtime.md): el buscador de "abrir
// bolsa" pasa de pegarle al server (products() con pageSize=300) a usar el
// catálogo offline (ensureOfflineCatalog + searchProducts), igual que
// StockScannerPage. Estos tests cubren ese flujo puntual del diálogo.
// ---------------------------------------------------------------------------
vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/components/hooks/useBranches", () => ({
  useBranches: vi.fn(),
}));

vi.mock("@/services/looseStock", () => ({
  listLooseStocks: vi.fn(),
  setLooseStock: vi.fn(),
  openBag: vi.fn(),
}));

vi.mock("@/services/priceKgPlan", () => ({
  getPriceKgPlan: vi.fn(),
}));

vi.mock("@/services/priceKgTypes", () => ({
  listPriceKgTypes: vi.fn(),
}));

vi.mock("@/services/priceKgBrands", () => ({
  listPriceKgBrands: vi.fn(),
}));

vi.mock("@/lib/offlineCatalog", () => ({
  ensureOfflineCatalog: vi.fn(),
  searchProducts: vi.fn(),
}));

import { LooseStockAdmin } from "@/views/LooseStockAdmin";
import { useBranches } from "@/components/hooks/useBranches";
import { listLooseStocks } from "@/services/looseStock";
import { getPriceKgPlan } from "@/services/priceKgPlan";
import { listPriceKgTypes } from "@/services/priceKgTypes";
import { listPriceKgBrands } from "@/services/priceKgBrands";
import { ensureOfflineCatalog, searchProducts } from "@/lib/offlineCatalog";

const mockUseBranches = vi.mocked(useBranches);
const mockListLooseStocks = vi.mocked(listLooseStocks);
const mockGetPriceKgPlan = vi.mocked(getPriceKgPlan);
const mockListPriceKgTypes = vi.mocked(listPriceKgTypes);
const mockListPriceKgBrands = vi.mocked(listPriceKgBrands);
const mockEnsureOfflineCatalog = vi.mocked(ensureOfflineCatalog);
const mockSearchProducts = vi.mocked(searchProducts);

function renderAdmin() {
  return render(<LooseStockAdmin />);
}

async function openBagDialog() {
  fireEvent.click(await screen.findByRole("button", { name: /abrir bolsa/i }));
}

describe("LooseStockAdmin — buscador de bolsa vía catálogo offline (T5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseBranches.mockReturnValue({
      branches: [{ id: "b1", name: "Sucursal 1", isActive: true, createdAt: "" }],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockListLooseStocks.mockResolvedValue({ items: [] });
    mockGetPriceKgPlan.mockResolvedValue([]);
    mockListPriceKgTypes.mockResolvedValue([]);
    mockListPriceKgBrands.mockResolvedValue([]);
    mockEnsureOfflineCatalog.mockResolvedValue(0);
    mockSearchProducts.mockReturnValue([]);
  });

  it("asegura el catálogo offline al abrir el diálogo de abrir bolsa", async () => {
    renderAdmin();
    await openBagDialog();

    await waitFor(() => expect(mockEnsureOfflineCatalog).toHaveBeenCalledTimes(1));
  });

  it("busca en el catálogo local (no en el server) tras el debounce y permite elegir un resultado", async () => {
    mockSearchProducts.mockReturnValue([
      {
        id: "p1",
        name: "Cat Chow 15kg",
        code: "CC15",
        barcode: null,
        price: 12000,
        priceKgLista: null,
        priceKgSuelto: null,
        priceKgSueltoManual: false,
        description: null,
        categoryId: null,
        categoryName: null,
        variants: [],
      },
    ]);

    renderAdmin();
    await openBagDialog();

    fireEvent.change(screen.getByPlaceholderText("Buscar producto..."), {
      target: { value: "cat chow" },
    });

    // Todavía no debería haberse llamado (debounce pendiente).
    expect(mockSearchProducts).not.toHaveBeenCalledWith("cat chow");

    await waitFor(() => expect(mockSearchProducts).toHaveBeenCalledWith("cat chow"));

    fireEvent.click(await screen.findByText("Cat Chow 15kg"));

    expect(screen.getByText(/Bolsa elegida:/)).toHaveTextContent("Cat Chow 15kg");
  });
});

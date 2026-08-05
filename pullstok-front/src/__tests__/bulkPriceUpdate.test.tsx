import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { mockNavigate, mockFetch } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockFetch: vi.fn(),
}));

vi.stubGlobal("fetch", mockFetch);

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/services/onboardingService", () => ({
  getCategories: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/services/productService", () => ({
  bulkPriceUpdate: vi.fn(),
}));

import { BulkPriceUpdate } from "@/views/BulkPriceUpdate";
import { bulkPriceUpdate } from "@/services/productService";

const mockBulkPriceUpdate = vi.mocked(bulkPriceUpdate);

const brands = [
  { id: "b-1", value: "Acme" },
  { id: "b-2", value: "Zap" },
];

const page1 = {
  affected: 60,
  previousTotal: 300,
  newTotal: 330,
  page: 1,
  pageSize: 50,
  total: 60,
  rows: [
    {
      id: "p-1",
      name: "Producto 1",
      categoryName: "Perros",
      brandValues: ["Acme"],
      oldPrice: 100,
      newPrice: 110,
      delta: 10,
    },
    {
      id: "p-2",
      name: "Producto 2",
      categoryName: "Perros",
      brandValues: ["Acme"],
      oldPrice: 200,
      newPrice: 220,
      delta: 20,
    },
  ],
};

const page2 = {
  affected: 60,
  previousTotal: 300,
  newTotal: 330,
  page: 2,
  pageSize: 50,
  total: 60,
  rows: [
    {
      id: "p-3",
      name: "Producto 3",
      categoryName: "Gatos",
      brandValues: ["Acme"],
      oldPrice: 0,
      newPrice: 0,
      delta: 0,
    },
  ],
};

const emptyPreview = {
  affected: 0,
  previousTotal: 0,
  newTotal: 0,
  page: 1,
  pageSize: 50,
  total: 0,
  rows: [],
};

function renderView() {
  return render(<BulkPriceUpdate />);
}

async function selectBrandAndPercent(percent = "10") {
  fireEvent.click(await screen.findByText("Acme"));
  fireEvent.change(screen.getByLabelText(/porcentaje/i), {
    target: { value: percent },
  });
}

describe("BulkPriceUpdate — preview, exclusions and apply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem("token", "test-token");
    mockFetch.mockResolvedValue({ ok: true, json: async () => brands });
    mockBulkPriceUpdate.mockResolvedValue(page1);
  });

  it("shows every preview row checked by default", async () => {
    renderView();
    await selectBrandAndPercent();
    fireEvent.click(screen.getByRole("button", { name: /calcular preview/i }));

    await screen.findByText("Producto 1");
    const checkboxes = screen.getAllByRole("checkbox", { name: /excluir/i });
    expect(checkboxes).toHaveLength(2);
    for (const cb of checkboxes) {
      expect(cb).toHaveAttribute("aria-checked", "true");
    }
  });

  it("sends the unchecked product inside excludeProductIds on apply", async () => {
    renderView();
    await selectBrandAndPercent();
    fireEvent.click(screen.getByRole("button", { name: /calcular preview/i }));

    fireEvent.click(await screen.findByRole("checkbox", { name: /excluir producto 1/i }));

    fireEvent.click(screen.getByRole("button", { name: "Aplicar cambios" }));
    fireEvent.click(await screen.findByRole("button", { name: "Aplicar" }));

    await waitFor(() =>
      expect(mockBulkPriceUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          excludeProductIds: ["p-1"],
          percentage: 10,
        }),
        false,
      ),
    );
  });

  it("keeps exclusions across pages when navigating the preview", async () => {
    mockBulkPriceUpdate
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(page2);

    renderView();
    await selectBrandAndPercent();
    fireEvent.click(screen.getByRole("button", { name: /calcular preview/i }));

    fireEvent.click(await screen.findByRole("checkbox", { name: /excluir producto 1/i }));
    fireEvent.click(screen.getByRole("button", { name: /siguiente/i }));

    await waitFor(() => {
      expect(mockBulkPriceUpdate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          excludeProductIds: ["p-1"],
          categoryIds: [],
        }),
        true,
        2,
      );
    });
    expect(await screen.findByText("Producto 3")).toBeInTheDocument();
  });

  it("shows a red warning when the percentage is negative", async () => {
    renderView();
    await selectBrandAndPercent("-20");

    expect(await screen.findByText(/disminución/i)).toBeInTheDocument();
  });

  it("disables apply when the affected set is empty", async () => {
    mockBulkPriceUpdate.mockResolvedValue(emptyPreview);

    renderView();
    await selectBrandAndPercent();
    fireEvent.click(screen.getByRole("button", { name: /calcular preview/i }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Aplicar cambios" }),
      ).toBeDisabled(),
    );
  });
});

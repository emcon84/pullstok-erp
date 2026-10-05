import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/components/hooks/useProducts", () => ({ useCreateProduct: vi.fn() }));
vi.mock("@/components/hooks/useProductStock", () => ({ useProductStock: vi.fn() }));
vi.mock("@/components/molecules/CategoryTreePicker", () => ({
  CategoryTreePicker: ({ disabled }: { disabled?: boolean }) => (
    <select data-testid="category-picker" disabled={disabled}>
      <option value="">—</option>
    </select>
  ),
}));
vi.mock("@/components/organisms/PresentationsSection/PresentationsSectionContainer", () => ({
  PresentationsSectionContainer: ({ onEnabledChange }: { onEnabledChange?: (v: boolean, list: unknown[]) => void }) => (
    <div data-testid="presentations-section">
      <button onClick={() => onEnabledChange?.(true, [])}>stub-enable</button>
      <button onClick={() => onEnabledChange?.(false, [])}>stub-disable</button>
    </div>
  ),
}));
vi.mock("@/services/onboardingService", () => ({
  getCategoryVariants: vi.fn().mockResolvedValue([]),
}));
vi.mock("react-toastify", () => ({ toast: { success: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock("@/services/productService", () => ({ updateProduct: vi.fn() }));

import { ProductDrawer } from "@/components/molecules/ProductDrawer";
import { useProductStock } from "@/components/hooks/useProductStock";
import { useCreateProduct } from "@/components/hooks/useProducts";
import { updateProduct } from "@/services/productService";
import { toast } from "react-toastify";
import type { DataItem } from "@/types";

const farmacia = { _id: "p1", name: "Ibuprofeno", price: 120, quantity: 5, category: { name: "FARMACIA" } } as unknown as DataItem;

const renderDrawer = (props: Partial<React.ComponentProps<typeof ProductDrawer>>) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ProductDrawer open onClose={vi.fn()} {...props} />
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem("user", JSON.stringify({ role: "ADMIN", branchIds: [] }));
  vi.mocked(useProductStock).mockReturnValue({
    stock: { productId: "p1", branches: [] },
    loading: false,
    error: null,
    updateBranchStock: vi.fn(),
    updating: false,
  } as never);
  vi.mocked(useCreateProduct).mockReturnValue({ createProduct: vi.fn(), loading: false, error: null, success: false } as never);
});

describe("ProductDrawer — presentations", () => {
  it("shows the presentations section for an existing FARMACIA product", () => {
    renderDrawer({ product: farmacia });
    expect(screen.getByTestId("presentations-section")).toBeInTheDocument();
  });

  it("also accepts the legacy string category", () => {
    renderDrawer({ product: { ...farmacia, category: "FARMACIA" } as DataItem });
    expect(screen.getByTestId("presentations-section")).toBeInTheDocument();
  });

  it("hides it for non-FARMACIA products, create mode and read-only", () => {
    const { unmount } = renderDrawer({ product: { ...farmacia, category: { name: "ALIMENTO" } } as unknown as DataItem });
    expect(screen.queryByTestId("presentations-section")).not.toBeInTheDocument();
    unmount();
    const second = renderDrawer({ product: null });
    expect(screen.queryByTestId("presentations-section")).not.toBeInTheDocument();
    second.unmount();
    renderDrawer({ product: farmacia, readOnly: true });
    expect(screen.queryByTestId("presentations-section")).not.toBeInTheDocument();
  });

  it("keeps the category selector enabled while presentations are off", () => {
    renderDrawer({ product: farmacia });
    expect(screen.getByTestId("category-picker")).toBeEnabled();
    expect(screen.queryByText(/no se puede cambiar mientras/i)).not.toBeInTheDocument();
  });

  it("disables the category selector with a hint when the product has presentations", () => {
    renderDrawer({ product: { ...farmacia, hasPresentations: true } });
    expect(screen.getByTestId("category-picker")).toBeDisabled();
    expect(screen.getByText(/no se puede cambiar mientras tenga presentaciones/i)).toBeInTheDocument();
  });

  it("follows enable/disable done inside the section", () => {
    renderDrawer({ product: farmacia });
    fireEvent.click(screen.getByText("stub-enable"));
    expect(screen.getByTestId("category-picker")).toBeDisabled();
    fireEvent.click(screen.getByText("stub-disable"));
    expect(screen.getByTestId("category-picker")).toBeEnabled();
  });

  it("surfaces PRESENTATIONS_CATEGORY_LOCKED with its Spanish message", async () => {
    vi.mocked(updateProduct).mockRejectedValue(
      Object.assign(new Error("server text"), { code: "PRESENTATIONS_CATEGORY_LOCKED" }),
    );
    renderDrawer({ product: farmacia });
    fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(vi.mocked(toast.error).mock.calls[0][0]).toMatch(/categoría.*presentaciones/i);
  });

  it("other save errors keep the server message", async () => {
    vi.mocked(updateProduct).mockRejectedValue(new Error("otro error"));
    renderDrawer({ product: farmacia });
    fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("otro error"));
  });
});

describe("ProductDrawer — branch stock in presentation levels", () => {
  const presentations = [
    { id: "a", name: "Caja", factor: 100, price: 1000, wholesalePrice: null, sortOrder: 0 },
    { id: "c", name: "Unidad", factor: 1, price: 20, wholesalePrice: null, sortOrder: 1 },
  ];
  const withStock = (quantity: number, canEdit = true) => {
    const update = vi.fn().mockResolvedValue({});
    vi.mocked(useProductStock).mockReturnValue({
      stock: {
        productId: "p1",
        branches: [{ branchId: "hq", branchName: "Casa Central", quantity, isHeadquarters: true, canEdit }],
      },
      loading: false,
      error: null,
      updateBranchStock: update,
      updating: false,
    } as never);
    return update;
  };

  it("displays the branch stock in levels and sends base units on save", async () => {
    const update = withStock(205);
    renderDrawer({ product: { ...farmacia, hasPresentations: true, presentations } });
    expect(screen.getByText(/2 Caja · 5 Unidad en stock/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Caja de Casa Central"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ branchId: "hq", quantity: 305 }));
  });

  it("keeps the single numeric input for products without presentations", async () => {
    const update = withStock(5);
    renderDrawer({ product: farmacia });
    expect(screen.getByText(/5 en stock/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Cantidad de Casa Central"), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ branchId: "hq", quantity: 9 }));
  });

  it("read-only branches only show the levels text", () => {
    withStock(205, false);
    renderDrawer({ product: { ...farmacia, hasPresentations: true, presentations } });
    expect(screen.getByText(/2 Caja · 5 Unidad en stock/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Caja de Casa Central")).not.toBeInTheDocument();
    expect(screen.getByText("Solo lectura")).toBeInTheDocument();
  });
});

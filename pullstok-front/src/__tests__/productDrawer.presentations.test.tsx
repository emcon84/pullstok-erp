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
  PresentationsSectionContainer: ({ onEnabledChange }: { onEnabledChange?: (v: boolean) => void }) => (
    <div data-testid="presentations-section">
      <button onClick={() => onEnabledChange?.(true)}>stub-enable</button>
      <button onClick={() => onEnabledChange?.(false)}>stub-disable</button>
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

const farmacia = { _id: "p1", name: "Ibuprofeno", price: 120, quantity: 5, category: { name: "FARMACIA" } };

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
    renderDrawer({ product: { ...farmacia, category: "FARMACIA" } });
    expect(screen.getByTestId("presentations-section")).toBeInTheDocument();
  });

  it("hides it for non-FARMACIA products, create mode and read-only", () => {
    const { unmount } = renderDrawer({ product: { ...farmacia, category: { name: "ALIMENTO" } } });
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

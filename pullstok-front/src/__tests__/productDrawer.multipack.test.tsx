import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// sdd/venta-por-unidad-multpack — el drawer de producto permite editar el
// unitsPerBox (unidades por caja), con hint de que puede derivarse del nombre.
vi.mock("@/components/hooks/useProducts", () => ({
  useCreateProduct: vi.fn(),
}));
vi.mock("@/components/hooks/useProductStock", () => ({
  useProductStock: vi.fn(),
}));
vi.mock("@/components/molecules/CategoryTreePicker", () => ({
  CategoryTreePicker: () => <select data-testid="category-picker" />,
}));
vi.mock("@/services/onboardingService", () => ({
  getCategoryVariants: vi.fn().mockResolvedValue([]),
}));
vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
vi.mock("@/services/productService", () => ({
  updateProduct: vi.fn(),
}));

import { ProductDrawer } from "@/components/molecules/ProductDrawer";
import { useProductStock } from "@/components/hooks/useProductStock";
import { useCreateProduct } from "@/components/hooks/useProducts";
import { updateProduct } from "@/services/productService";
import type { DataItem } from "@/types";

const mockUseProductStock = vi.mocked(useProductStock);
const mockUseCreateProduct = vi.mocked(useCreateProduct);
const updateProductMock = vi.mocked(updateProduct);

const editProduct: DataItem = {
  _id: "p1",
  name: "FELIX POUCH PESC X 15x85grs",
  price: 18400,
  quantity: 5,
  unitsPerBox: 15,
};

function renderDrawer(props: React.ComponentProps<typeof ProductDrawer>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ProductDrawer {...props} />
    </QueryClientProvider>,
  );
}

describe("ProductDrawer — unitsPerBox editable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem("user", JSON.stringify({ role: "ADMIN", branchIds: [] }));
    mockUseProductStock.mockReturnValue({
      stock: undefined,
      loading: false,
      error: null,
      updateBranchStock: vi.fn().mockResolvedValue({}),
      updating: false,
    });
    mockUseCreateProduct.mockReturnValue({
      createProduct: vi.fn(),
      loading: false,
      error: null,
      success: false,
    });
  });

  it("renders an editable unitsPerBox field with the auto-derive hint", () => {
    renderDrawer({ open: true, onClose: vi.fn(), product: editProduct });
    expect(screen.getByLabelText(/Unidades por caja/i)).toBeInTheDocument();
    expect(screen.getByText(/puede derivarse del nombre/i)).toBeInTheDocument();
  });

  it("pre-fills unitsPerBox from the product", () => {
    renderDrawer({ open: true, onClose: vi.fn(), product: editProduct });
    const input = screen.getByLabelText(/Unidades por caja/i) as HTMLInputElement;
    expect(input.value).toBe("15");
  });

  it("sends unitsPerBox in the update payload", async () => {
    updateProductMock.mockResolvedValue({ message: "ok" });
    renderDrawer({ open: true, onClose: vi.fn(), product: editProduct });

    fireEvent.change(screen.getByLabelText(/Unidades por caja/i), {
      target: { value: "24" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));

    await waitFor(() => expect(updateProductMock).toHaveBeenCalled());
    const payload = updateProductMock.mock.calls[0][0];
    expect(payload.unitsPerBox).toBe(24);
  });
});

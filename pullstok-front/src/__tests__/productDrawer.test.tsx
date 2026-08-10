import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// ---------------------------------------------------------------------------
// Hoisted mocks — the drawer consumes hooks and services; we stub them so the
// tests focus on the stock-by-branch rendering contract (spec F1).
// ---------------------------------------------------------------------------
vi.mock("@/components/hooks/useProducts", () => ({
  useCreateProduct: vi.fn(),
}));

vi.mock("@/components/hooks/useProductStock", () => ({
  useProductStock: vi.fn(),
}));

vi.mock("@/components/molecules/CategoryTreePicker", () => ({
  CategoryTreePicker: () => <div data-testid="category-picker" />,
}));

vi.mock("@/services/onboardingService", () => ({
  getCategoryVariants: vi.fn().mockResolvedValue([]),
}));

vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/services/productService", () => ({
  updateProduct: vi.fn(),
}));

import { ProductDrawer } from "@/components/molecules/ProductDrawer";
import { useProductStock } from "@/components/hooks/useProductStock";
import { useCreateProduct } from "@/components/hooks/useProducts";
import { updateProduct } from "@/services/productService";
import type { BranchStockInfo } from "@/services/productService";

const mockUseProductStock = vi.mocked(useProductStock);
const mockUseCreateProduct = vi.mocked(useCreateProduct);
const updateProductMock = vi.mocked(updateProduct);
const mockUpdateBranchStock = vi.fn();

const editProduct = {
  _id: "p1",
  name: "Collar de Cuero",
  price: 1500,
  quantity: 5,
};

const stock = (branches: BranchStockInfo[]) => ({
  productId: "p1",
  branches,
});

const hq = (canEdit = true): BranchStockInfo => ({
  branchId: "hq",
  branchName: "Casa Central",
  quantity: 5,
  isHeadquarters: true,
  canEdit,
});

const suc2 = (canEdit = false): BranchStockInfo => ({
  branchId: "b2",
  branchName: "Sucursal 2",
  quantity: 3,
  isHeadquarters: false,
  canEdit,
});

function setLoggedUser(role: string, branchIds: string[] = []) {
  localStorage.setItem("user", JSON.stringify({ role, branchIds }));
}

function renderDrawer(props: React.ComponentProps<typeof ProductDrawer>) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ProductDrawer {...props} />
    </QueryClientProvider>,
  );
}

describe("ProductDrawer — stock por sucursal (edit mode)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    setLoggedUser("ADMIN");
    mockUpdateBranchStock.mockResolvedValue({ branchId: "hq", quantity: 5 });
    mockUseProductStock.mockReturnValue({
      stock: stock([hq(), suc2()]),
      loading: false,
      error: null,
      updateBranchStock: mockUpdateBranchStock,
      updating: false,
    });
    mockUseCreateProduct.mockReturnValue({
      createProduct: vi.fn(),
      loading: false,
      error: null,
      success: false,
    });
  });

  it("renders one card per branch from the self-contained response", () => {
    mockUseProductStock.mockReturnValue({
      stock: stock([hq(), suc2(), { ...suc2(), branchId: "b3", branchName: "Sucursal 3" }]),
      loading: false,
      error: null,
      updateBranchStock: mockUpdateBranchStock,
      updating: false,
    });
    renderDrawer({ open: true, onClose: vi.fn(), product: editProduct });

    expect(screen.getByText("Casa Central")).toBeInTheDocument();
    expect(screen.getByText("Sucursal 2")).toBeInTheDocument();
    expect(screen.getByText("Sucursal 3")).toBeInTheDocument();
  });

  it("enables inline editing only on branches the user can edit", () => {
    mockUseProductStock.mockReturnValue({
      stock: stock([hq(true), suc2(false)]),
      loading: false,
      error: null,
      updateBranchStock: mockUpdateBranchStock,
      updating: false,
    });
    renderDrawer({ open: true, onClose: vi.fn(), product: editProduct });

    expect(screen.getByLabelText("Cantidad de Casa Central")).toBeInTheDocument();
    expect(screen.queryByLabelText("Cantidad de Sucursal 2")).not.toBeInTheDocument();
    expect(screen.getByText("Solo lectura")).toBeInTheDocument();
  });

  it("gates editing with the client policy: a VENDEDOR only edits assigned branches", () => {
    setLoggedUser("VENDEDOR", ["hq"]);
    // Server would never mark an unassigned branch editable, but the client
    // policy must still hold if it did: canEdit=true + no assignment → read-only.
    mockUseProductStock.mockReturnValue({
      stock: stock([hq(true), suc2(true)]),
      loading: false,
      error: null,
      updateBranchStock: mockUpdateBranchStock,
      updating: false,
    });
    renderDrawer({ open: true, onClose: vi.fn(), product: editProduct });

    expect(screen.getByLabelText("Cantidad de Casa Central")).toBeInTheDocument();
    expect(screen.queryByLabelText("Cantidad de Sucursal 2")).not.toBeInTheDocument();
  });

  it("removes the global editable quantity input in edit mode", () => {
    renderDrawer({ open: true, onClose: vi.fn(), product: editProduct });

    expect(document.getElementById("p-qty")).toBeNull();
    expect(screen.queryByLabelText("Cantidad", { exact: true })).not.toBeInTheDocument();
  });

  it("saves a branch stock update with the edited quantity", async () => {
    renderDrawer({ open: true, onClose: vi.fn(), product: editProduct });

    const input = screen.getByLabelText("Cantidad de Casa Central") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() =>
      expect(mockUpdateBranchStock).toHaveBeenCalledWith({
        branchId: "hq",
        quantity: 8,
      }),
    );
  });

  it("does not send the global quantity when submitting an edit", async () => {
    updateProductMock.mockResolvedValue({ message: "ok" });
    renderDrawer({ open: true, onClose: vi.fn(), product: editProduct });

    fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));

    await waitFor(() => expect(updateProductMock).toHaveBeenCalled());
    const payloadArg = updateProductMock.mock.calls[0][0];
    expect(payloadArg.quantity).toBeUndefined();
    expect(payloadArg._id).toBe("p1");
  });
});

describe("ProductDrawer — create mode keeps the global quantity flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    setLoggedUser("ADMIN");
    mockUseProductStock.mockReturnValue({
      stock: undefined,
      loading: false,
      error: null,
      updateBranchStock: mockUpdateBranchStock,
      updating: false,
    });
  });

  it("still renders the global quantity input when creating", () => {
    renderDrawer({ open: true, onClose: vi.fn(), product: null });

    expect(screen.getByLabelText("Cantidad")).toBeInTheDocument();
    expect(document.getElementById("p-qty")).not.toBeNull();
  });

  it("sends the global quantity in the create payload (server syncs HQ stock)", async () => {
    const createProductMock = vi.fn().mockResolvedValue({ id: "p9" });
    mockUseCreateProduct.mockReturnValue({
      createProduct: createProductMock,
      loading: false,
      error: null,
      success: false,
    });
    const onCreated = vi.fn();
    renderDrawer({
      open: true,
      onClose: vi.fn(),
      product: null,
      onCreated,
    });

    fireEvent.change(screen.getByLabelText(/nombre/i), {
      target: { value: "Nuevo producto" },
    });
    fireEvent.change(screen.getByLabelText("Cantidad"), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear producto" }));

    await waitFor(() =>
      expect(createProductMock).toHaveBeenCalledWith(
        expect.objectContaining({ quantity: 5 }),
      ),
    );
  });
});

// ── Venta suelta fields (sdd/venta-alimento-suelto A-02) ──

describe("ProductDrawer — loose-sale fields (weightKg, bulkFactor, priceKgSuelto)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    setLoggedUser("ADMIN");
    mockUseProductStock.mockReturnValue({
      stock: stock([hq()]),
      loading: false,
      error: null,
      updateBranchStock: mockUpdateBranchStock,
      updating: false,
    });
    mockUseCreateProduct.mockReturnValue({
      createProduct: vi.fn(),
      loading: false,
      error: null,
      success: false,
    });
  });

  it("renders weightKg and bulkFactor inputs in edit mode", () => {
    renderDrawer({
      open: true,
      onClose: vi.fn(),
      product: { ...editProduct, weightKg: 15, bulkFactor: 1.3, priceKgSuelto: 360 },
    });
    expect(screen.getByLabelText("Peso (kg)")).toBeInTheDocument();
    expect(screen.getByLabelText("Factor mayorista propio")).toBeInTheDocument();
  });

  it("shows read-only priceKgSuelto when product has it", () => {
    renderDrawer({
      open: true,
      onClose: vi.fn(),
      product: { ...editProduct, weightKg: 15, bulkFactor: null, priceKgSuelto: 360 },
    });
    expect(screen.getByText("Precio por kilo (calculado)")).toBeInTheDocument();
    expect(screen.getByText(/\$360,00/)).toBeInTheDocument();
  });

  it("does not show priceKgSuelto block when product has no priceKgSuelto", () => {
    renderDrawer({
      open: true,
      onClose: vi.fn(),
      product: { ...editProduct, weightKg: null, priceKgSuelto: null },
    });
    expect(screen.queryByText("Precio por kilo (calculado)")).not.toBeInTheDocument();
  });

  it("hides loose fields in readOnly mode", () => {
    renderDrawer({
      open: true,
      onClose: vi.fn(),
      product: { ...editProduct, weightKg: 15, priceKgSuelto: 360 },
      readOnly: true,
    });
    // In readOnly mode, the !readOnly wrapper hides weight/bulk inputs.
    expect(screen.queryByLabelText("Peso (kg)")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Factor mayorista propio")).not.toBeInTheDocument();
  });

  it("sends weightKg and bulkFactor in update payload", async () => {
    updateProductMock.mockResolvedValue({ message: "ok" });
    renderDrawer({
      open: true,
      onClose: vi.fn(),
      product: { ...editProduct, weightKg: 15, priceKgSuelto: 360 },
    });

    // Set the weight and factor inputs
    fireEvent.change(screen.getByLabelText("Peso (kg)"), { target: { value: "7.5" } });
    fireEvent.change(screen.getByLabelText("Factor mayorista propio"), { target: { value: "1.25" } });
    fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));

    await waitFor(() => expect(updateProductMock).toHaveBeenCalled());
    const payload = updateProductMock.mock.calls[0][0];
    expect(payload.weightKg).toBe(7.5);
    expect(payload.bulkFactor).toBe(1.25);
  });

  it("sends null bulkFactor when input is empty (use org default)", async () => {
    updateProductMock.mockResolvedValue({ message: "ok" });
    renderDrawer({
      open: true,
      onClose: vi.fn(),
      product: { ...editProduct, weightKg: 15 },
    });

    // Leave bulkFactor empty, set weight
    fireEvent.change(screen.getByLabelText("Peso (kg)"), { target: { value: "7.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));

    await waitFor(() => expect(updateProductMock).toHaveBeenCalled());
    const payload = updateProductMock.mock.calls[0][0];
    expect(payload.weightKg).toBe(7.5);
    expect(payload.bulkFactor).toBeNull(); // empty → null (org default)
  });
});

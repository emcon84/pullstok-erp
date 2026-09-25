import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Diálogo "Agregar al sistema": elige la categoría real destino (reusa
// CategoryTreePicker, sin "Carga manual") y llama a la mutation de promover.
const { mockPromote, toastSuccess, toastError } = vi.hoisted(() => ({
  mockPromote: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("react-toastify", () => ({
  toast: { success: toastSuccess, error: toastError, warn: vi.fn() },
}));
vi.mock("@/components/hooks/usePromoteManualProduct", () => ({
  usePromoteManualProduct: () => ({ promote: mockPromote, promoting: false }),
}));
vi.mock("@/services/onboardingService", () => ({
  getCategories: vi.fn(),
}));

import { PromoteManualProductDialog } from "@/components/molecules/PromoteManualProductDialog";
import { CategoryTreePicker } from "@/components/molecules/CategoryTreePicker";
import { buildTree, omitRootsByName } from "@/components/molecules/CategoryTreePicker/tree";
import { getCategories } from "@/services/onboardingService";
import type { ManualProduct } from "@/services/productService";

const mockGetCategories = vi.mocked(getCategories);

const categories = [
  { id: "cm", name: "Carga manual", organizationId: "org-1", parentId: null },
  { id: "a", name: "Alimento", organizationId: "org-1", parentId: null },
  { id: "b", name: "Perro", organizationId: "org-1", parentId: "a" },
];

const product: ManualProduct = {
  id: "p1",
  name: "TORNILLO",
  price: 1500,
  quantity: 0,
  isManual: true,
  categoryId: "cm",
  category: { id: "cm", name: "Carga manual" },
};

describe("omitRootsByName (helper)", () => {
  it("quita solo las raíces con ese nombre, no los hijos homónimos", () => {
    const tree = buildTree([
      { id: "r1", name: "Carga manual", organizationId: "o", parentId: null },
      { id: "r2", name: "Alimento", organizationId: "o", parentId: null },
      { id: "c1", name: "Carga manual", organizationId: "o", parentId: "r2" },
    ]);
    const result = omitRootsByName(tree, ["Carga manual"]);
    expect(result.map((n) => n.id)).toEqual(["r2"]);
    expect(result[0].children.map((n) => n.id)).toEqual(["c1"]);
  });
});

describe("CategoryTreePicker excludeRootNames", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCategories.mockResolvedValue(categories);
  });

  it("oculta la raíz excluida y sigue mostrando el resto", async () => {
    render(<CategoryTreePicker value={null} onChange={vi.fn()} excludeRootNames={["Carga manual"]} />);
    expect(await screen.findByText("Alimento")).toBeInTheDocument();
    expect(screen.queryByText("Carga manual")).not.toBeInTheDocument();
  });

  it("sin la prop muestra todas las raíces (compatibilidad)", async () => {
    render(<CategoryTreePicker value={null} onChange={vi.fn()} />);
    expect(await screen.findByText("Carga manual")).toBeInTheDocument();
  });
});

describe("PromoteManualProductDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCategories.mockResolvedValue(categories);
    mockPromote.mockResolvedValue({ ...product, isManual: false });
  });

  it("no se muestra sin producto", () => {
    render(<PromoteManualProductDialog product={null} onOpenChange={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("muestra el producto y excluye la categoría 'Carga manual' de las opciones", async () => {
    render(<PromoteManualProductDialog product={product} onOpenChange={vi.fn()} />);

    expect(await screen.findByText("Alimento")).toBeInTheDocument();
    expect(screen.getByText("TORNILLO")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Carga manual/ })).not.toBeInTheDocument();
  });

  it("exige elegir una categoría: el botón confirmar está deshabilitado hasta entonces", async () => {
    render(<PromoteManualProductDialog product={product} onOpenChange={vi.fn()} />);
    await screen.findByText("Alimento");

    const confirm = screen.getByRole("button", { name: "Agregar al sistema" });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(mockPromote).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Alimento"));
    expect(confirm).toBeEnabled();
  });

  it("confirma: promueve con los ids correctos, avisa por toast y cierra", async () => {
    const onOpenChange = vi.fn();
    render(<PromoteManualProductDialog product={product} onOpenChange={onOpenChange} />);
    await screen.findByText("Alimento");

    fireEvent.click(screen.getByText("Alimento"));
    fireEvent.click(screen.getByRole("button", { name: "Agregar al sistema" }));

    await waitFor(() =>
      expect(mockPromote).toHaveBeenCalledWith({ id: "p1", categoryId: "a" }),
    );
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("si la API falla muestra el message del server y no cierra", async () => {
    mockPromote.mockRejectedValue(new Error("La categoría indicada no existe"));
    const onOpenChange = vi.fn();
    render(<PromoteManualProductDialog product={product} onOpenChange={onOpenChange} />);
    await screen.findByText("Alimento");

    fireEvent.click(screen.getByText("Alimento"));
    fireEvent.click(screen.getByRole("button", { name: "Agregar al sistema" }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("La categoría indicada no existe"),
    );
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

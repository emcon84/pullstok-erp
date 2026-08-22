import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/components/hooks/useBranches", () => ({
  useBranches: vi.fn(),
  useCreateBranch: vi.fn(),
  useUpdateBranch: vi.fn(),
  useDeleteBranch: vi.fn(),
  useToggleBranchActive: vi.fn(),
}));

vi.mock("@/components/hooks/useConfirm", () => ({
  useConfirm: vi.fn().mockReturnValue(vi.fn()),
}));

vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { BranchesPage } from "@/views/BranchesPage";
import {
  useBranches,
  useCreateBranch,
  useUpdateBranch,
  useDeleteBranch,
  useToggleBranchActive,
} from "@/components/hooks/useBranches";

const mockUseBranches = vi.mocked(useBranches);
const mockUseCreateBranch = vi.mocked(useCreateBranch);
const mockUseUpdateBranch = vi.mocked(useUpdateBranch);
const mockUseDeleteBranch = vi.mocked(useDeleteBranch);
const mockUseToggleBranchActive = vi.mocked(useToggleBranchActive);

const branches = [
  {
    id: "b-1",
    name: "Centro",
    address: null,
    phone: null,
    isActive: true,
    puntoVenta: 5,
    createdAt: "2026-08-22T00:00:00.000Z",
  },
  {
    id: "b-2",
    name: "Norte",
    address: null,
    phone: null,
    isActive: true,
    puntoVenta: null,
    createdAt: "2026-08-22T00:00:00.000Z",
  },
];

function renderPage(overrides: {
  createBranch?: ReturnType<typeof vi.fn>;
  updateBranch?: ReturnType<typeof vi.fn>;
} = {}) {
  const createBranch = overrides.createBranch ?? vi.fn();
  const updateBranch = overrides.updateBranch ?? vi.fn();
  mockUseBranches.mockReturnValue({
    branches,
    loading: false,
    error: null,
    refetch: vi.fn(),
  });
  mockUseCreateBranch.mockReturnValue({
    createBranch,
    loading: false,
    error: null,
    success: false,
  });
  mockUseUpdateBranch.mockReturnValue({
    updateBranch,
    loading: false,
    error: null,
    success: false,
  });
  mockUseDeleteBranch.mockReturnValue({
    deleteBranch: vi.fn(),
    loading: false,
    error: null,
    success: false,
  });
  mockUseToggleBranchActive.mockReturnValue({
    toggleBranchActive: vi.fn(),
    loading: false,
    error: null,
    success: false,
  });
  return render(<BranchesPage />);
}

describe("BranchesPage — campo Punto de venta (sdd/sucursales-pv-facturacion)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("muestra la columna 'Punto de venta' y el valor guardado", async () => {
    renderPage();

    expect(screen.getByText("Punto de venta")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    // Sucursal sin PV muestra el placeholder de vacío.
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("envía puntoVenta al crear una sucursal", async () => {
    const createBranch = vi.fn();
    renderPage({ createBranch });

    fireEvent.click(screen.getByRole("button", { name: "Nueva sucursal" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Nombre")).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByLabelText("Nombre"), {
      target: { value: "Oeste" },
    });
    fireEvent.change(screen.getByLabelText("Punto de venta"), {
      target: { value: "7" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Crear sucursal" }));

    await waitFor(() => expect(createBranch).toHaveBeenCalled());
    expect(createBranch.mock.calls[0][0]).toMatchObject({
      name: "Oeste",
      puntoVenta: 7,
    });
  });

  it("pre-carga y actualiza el punto de venta al editar", async () => {
    const updateBranch = vi.fn();
    renderPage({ updateBranch });

    fireEvent.click(screen.getAllByRole("button", { name: /editar/i })[0]);

    await waitFor(() =>
      expect(screen.getByDisplayValue("5")).toBeInTheDocument(),
    );
    fireEvent.change(screen.getByDisplayValue("5"), {
      target: { value: "9" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(updateBranch).toHaveBeenCalled());
    expect(updateBranch.mock.calls[0][0].data).toMatchObject({ puntoVenta: 9 });
  });
});

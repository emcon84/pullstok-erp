import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Vista admin "Carga manual": tabla (nombre, precio, categoría, acciones),
// vacío, carga, error, guard de rol, diálogo "Agregar al sistema" y flujo de
// eliminación con confirmación.
const { state, mockRefetch, mockDeleteProduct, mockToast } = vi.hoisted(() => ({
  state: {
    products: [] as unknown[],
    loading: false,
    error: null as Error | null,
    deleting: false,
  },
  mockRefetch: vi.fn(),
  mockDeleteProduct: vi.fn(),
  mockToast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("react-toastify", () => ({ toast: mockToast }));
vi.mock("@/components/hooks/useDeleteManualProduct", () => ({
  useDeleteManualProduct: () => ({
    deleteProduct: mockDeleteProduct,
    deleting: state.deleting,
  }),
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
import { ConfirmProvider } from "@/components/hooks/useConfirm";
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
      <ConfirmProvider>
        <MemoryRouter initialEntries={["/carga-manual"]}>
          <Routes>
            <Route path="/carga-manual" element={<ManualProducts />} />
            <Route path="/dashboard" element={<div>DASHBOARD</div>} />
          </Routes>
        </MemoryRouter>
      </ConfirmProvider>
    </QueryClientProvider>,
  );
}

/** Abre el confirm de eliminación de la fila con ese nombre y devuelve el diálogo. */
async function openDeleteConfirm(name: string) {
  await screen.findByText(name);
  fireEvent.click(screen.getByRole("button", { name: `Eliminar ${name}` }));
  return within(await screen.findByRole("alertdialog"));
}

describe("ManualProducts (vista admin)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.products = rows;
    state.loading = false;
    state.error = null;
    state.deleting = false;
    mockDeleteProduct.mockResolvedValue({ message: "Producto eliminado" });
    mockGetMe.mockResolvedValue({ role: "ADMIN" } as never);
  });

  it("renderiza una tabla con las columnas Nombre, Precio, Categoría y Acciones", async () => {
    renderView();

    expect(await screen.findByRole("table")).toBeInTheDocument();
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Nombre", "Precio", "Categoría", "Acciones"]);
  });

  it("cada producto es una fila con su nombre, precio y categoría", async () => {
    renderView();
    await screen.findByRole("table");

    const dataRows = screen.getAllByRole("row").slice(1); // sin el encabezado
    expect(dataRows).toHaveLength(2);
    const tornillo = within(dataRows[0]);
    expect(tornillo.getByText("TORNILLO")).toBeInTheDocument();
    expect(tornillo.getByText(/1\.500/)).toBeInTheDocument();
    expect(tornillo.getByText("Carga manual")).toBeInTheDocument();
    expect(tornillo.getByRole("button", { name: /Agregar al sistema/ })).toBeInTheDocument();
    expect(tornillo.getByRole("button", { name: /Eliminar/ })).toBeInTheDocument();
  });

  it("no renderiza la tabla en vacío, carga ni error", async () => {
    state.products = [];
    renderView();
    await screen.findByText(/No hay productos pendientes/);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
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

  describe("eliminar", () => {
    it("'Eliminar' abre la confirmación avisando que es permanente y que las ventas conservan el historial", async () => {
      renderView();
      const dialog = await openDeleteConfirm("TUERCA");

      expect(dialog.getByText(/permanentemente/i)).toBeInTheDocument();
      expect(dialog.getByText(/ventas.*historial/i)).toBeInTheDocument();
      expect(mockDeleteProduct).not.toHaveBeenCalled();
    });

    it("cancelar no elimina nada", async () => {
      renderView();
      const dialog = await openDeleteConfirm("TUERCA");

      fireEvent.click(dialog.getByRole("button", { name: "Cancelar" }));

      await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
      expect(mockDeleteProduct).not.toHaveBeenCalled();
      expect(mockToast.success).not.toHaveBeenCalled();
    });

    it("confirmar elimina el producto de esa fila y muestra el toast de éxito", async () => {
      renderView();
      const dialog = await openDeleteConfirm("TUERCA");

      fireEvent.click(dialog.getByRole("button", { name: "Eliminar" }));

      await waitFor(() => expect(mockDeleteProduct).toHaveBeenCalledWith("p2"));
      expect(mockDeleteProduct).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(mockToast.success).toHaveBeenCalledTimes(1));
      expect(mockToast.success.mock.calls[0][0]).toMatch(/TUERCA/);
      expect(mockRefetch).not.toHaveBeenCalled();
    });

    it("si la API rechaza (409) muestra el message del server y no refetchea", async () => {
      mockDeleteProduct.mockRejectedValue(
        Object.assign(
          new Error("No se puede eliminar: el producto está en un pedido o presupuesto"),
          { status: 409 },
        ),
      );
      renderView();
      const dialog = await openDeleteConfirm("TORNILLO");

      fireEvent.click(dialog.getByRole("button", { name: "Eliminar" }));

      await waitFor(() =>
        expect(mockToast.error).toHaveBeenCalledWith(
          "No se puede eliminar: el producto está en un pedido o presupuesto",
        ),
      );
      expect(mockToast.success).not.toHaveBeenCalled();
      expect(mockRefetch).not.toHaveBeenCalled();
    });

    it("si el producto ya no existe (404) muestra el error y refetchea la lista", async () => {
      mockDeleteProduct.mockRejectedValue(
        Object.assign(new Error("Producto manual no encontrado"), { status: 404 }),
      );
      renderView();
      const dialog = await openDeleteConfirm("TORNILLO");

      fireEvent.click(dialog.getByRole("button", { name: "Eliminar" }));

      await waitFor(() =>
        expect(mockToast.error).toHaveBeenCalledWith("Producto manual no encontrado"),
      );
      await waitFor(() => expect(mockRefetch).toHaveBeenCalledTimes(1));
    });

    it("no dispara una segunda eliminación mientras la primera sigue en curso", async () => {
      mockDeleteProduct.mockReturnValue(new Promise(() => {})); // nunca resuelve
      renderView();
      const first = await openDeleteConfirm("TUERCA");
      fireEvent.click(first.getByRole("button", { name: "Eliminar" }));
      await waitFor(() => expect(mockDeleteProduct).toHaveBeenCalledTimes(1));

      // Con una eliminación en vuelo, otro click en "Eliminar" se ignora: ni
      // abre la confirmación ni dispara una segunda llamada.
      fireEvent.click(screen.getByRole("button", { name: "Eliminar TORNILLO" }));
      await new Promise((r) => setTimeout(r, 50));

      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      expect(mockDeleteProduct).toHaveBeenCalledTimes(1);
    });

    it("deshabilita los botones de acción mientras se elimina", async () => {
      state.deleting = true;
      renderView();
      await screen.findByRole("table");

      for (const btn of screen.getAllByRole("button", { name: /Eliminar/ })) {
        expect(btn).toBeDisabled();
      }
      for (const btn of screen.getAllByRole("button", { name: /Agregar al sistema/ })) {
        expect(btn).toBeDisabled();
      }
    });
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

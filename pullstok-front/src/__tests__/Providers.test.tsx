import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("../components/hooks/useProvider", () => ({
  useProviders: vi.fn(),
  useCreateProvider: vi.fn(),
  useUpdateProvider: vi.fn(),
}));

import { Providers } from "../views/Providers";
import {
  useProviders,
  useCreateProvider,
  useUpdateProvider,
} from "../components/hooks/useProvider";

const submitProvider = vi.fn();
const updateProvider = vi.fn();

const PROVIDERS = [
  { id: "p1", name: "Alican SA", code: "P-1", taxId: "30111111111", isActive: true },
  { id: "p2", name: "Vieja Distribuidora", code: "P-2", taxId: "30222222222", isActive: false },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useProviders).mockReturnValue({
    providers: PROVIDERS,
    loadingProvider: false,
    errorProvider: null,
  } as any);
  vi.mocked(useCreateProvider).mockReturnValue({
    submitProvider,
    loadingProvider: false,
    errorProvider: null,
  } as any);
  vi.mocked(useUpdateProvider).mockReturnValue({
    updateProvider,
    loadingUpdate: false,
    error: null,
  } as any);
});

describe("Providers view", () => {
  it("por defecto lista solo los activos y el filtro 'Inactivos' muestra los inactivos", () => {
    render(<Providers />);
    expect(screen.getByText("Alican SA")).toBeInTheDocument();
    expect(screen.queryByText("Vieja Distribuidora")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Inactivos" }));
    expect(screen.queryByText("Alican SA")).not.toBeInTheDocument();
    expect(screen.getByText("Vieja Distribuidora")).toBeInTheDocument();
  });

  it("busca por CUIT y por código", () => {
    render(<Providers />);
    fireEvent.click(screen.getByRole("button", { name: "Todos" }));
    const input = screen.getByLabelText("Buscar proveedores");

    fireEvent.change(input, { target: { value: "30222" } });
    expect(screen.queryByText("Alican SA")).not.toBeInTheDocument();
    expect(screen.getByText("Vieja Distribuidora")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "p-1" } });
    expect(screen.getByText("Alican SA")).toBeInTheDocument();
  });

  it("el alta exige nombre y envía los campos sin vacíos", () => {
    render(<Providers />);
    fireEvent.click(screen.getByRole("button", { name: "Agregar proveedor" }));

    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(submitProvider).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: " Nuevo SRL " } });
    fireEvent.change(screen.getByLabelText("CUIT"), { target: { value: "30-1-2" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(submitProvider).toHaveBeenCalledTimes(1);
    const payload = submitProvider.mock.calls[0][0];
    expect(payload.name).toBe("Nuevo SRL");
    expect(payload.taxId).toBe("30-1-2");
    expect(payload.code).toBeUndefined();
    expect(payload.isActive).toBe(true);
  });

  it("desactivar manda isActive=false (no borra)", () => {
    render(<Providers />);
    fireEvent.click(screen.getByRole("button", { name: "Desactivar Alican SA" }));
    expect(updateProvider).toHaveBeenCalledWith(
      { id: "p1", isActive: false },
      expect.any(Object),
    );
  });
});

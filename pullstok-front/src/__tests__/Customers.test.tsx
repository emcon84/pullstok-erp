import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("../services/customerService", () => ({
  fetchPadron: vi.fn(),
  getCustomers: vi.fn(),
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  deleteCustomer: vi.fn(),
}));

vi.mock("../components/hooks/useCustomer", () => ({
  useCustomers: vi.fn(),
  useCreateCustomer: vi.fn(),
  useUpdateCustomer: vi.fn(),
  useDeleteCustomer: vi.fn(),
}));

import { Customers } from "../views/Customers";
import { fetchPadron } from "../services/customerService";
import {
  useCustomers,
  useCreateCustomer,
  useUpdateCustomer,
  useDeleteCustomer,
} from "../components/hooks/useCustomer";
import { toast } from "react-toastify";

const fetchPadronMock = vi.mocked(fetchPadron);

const renderCustomers = () => {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <Customers />
    </QueryClientProvider>,
  );
};

const persona = {
  cuit: "20000000001",
  razonSocial: "GOMEZ JUAN CARLOS",
  estado: "ACTIVO",
  impuestos: [{ id: 30, descripcion: "IVA", estado: "ACTIVO" }],
  domicilio: {
    direccion: "AV CORRIENTES 1234",
    localidad: "CIUDAD AUTONOMA BUENOS AIRES",
    codPostal: "1043",
    provincia: "CIUDAD AUTONOMA BUENOS AIRES",
  },
  constanciaUrl: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  (useCustomers as any).mockReturnValue({
    customers: [],
    loadingCustomer: false,
    errorCustomer: null,
  });
  (useCreateCustomer as any).mockReturnValue({
    submitCustomer: vi.fn(),
    loadingCustomer: false,
  });
  (useUpdateCustomer as any).mockReturnValue({
    updateCustomer: vi.fn(),
    loadingUpdate: false,
  });
  (useDeleteCustomer as any).mockReturnValue({
    deleteCustomer: vi.fn(),
    loading: false,
  });
});

describe("Customers — autocompletado con padrón ARCA", () => {
  it("abre el modal y muestra los campos CUIT / Condición de IVA / Domicilio", () => {
    renderCustomers();
    fireEvent.click(screen.getByRole("button", { name: "Agregar cliente" }));

    expect(screen.getByLabelText("CUIT")).toBeInTheDocument();
    expect(screen.getByLabelText("Condición de IVA")).toBeInTheDocument();
    expect(screen.getByLabelText("Domicilio")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Consultar ARCA" })).toBeInTheDocument();
  });

  it("CUIT válido + click Consultar ARCA → autocompleta nombre/condición/domicilio", async () => {
    fetchPadronMock.mockResolvedValue(persona as any);
    renderCustomers();
    fireEvent.click(screen.getByRole("button", { name: "Agregar cliente" }));

    const cuitInput = screen.getByLabelText("CUIT") as HTMLInputElement;
    fireEvent.change(cuitInput, { target: { value: "20-00000000-1" } });

    const consultarBtn = screen.getByRole("button", { name: "Consultar ARCA" });
    expect(consultarBtn).not.toBeDisabled();
    fireEvent.click(consultarBtn);

    await waitFor(() => {
      expect(fetchPadronMock).toHaveBeenCalledWith("20000000001");
    });

    expect((screen.getByLabelText("Nombre") as HTMLInputElement).value).toBe(
      "GOMEZ JUAN CARLOS",
    );
    expect((screen.getByLabelText("Condición de IVA") as HTMLInputElement).value).toBe(
      "IVA",
    );
    expect((screen.getByLabelText("Domicilio") as HTMLInputElement).value).toBe(
      "AV CORRIENTES 1234, CIUDAD AUTONOMA BUENOS AIRES, CIUDAD AUTONOMA BUENOS AIRES, 1043",
    );
  });

  it("CUIT inexistente → toast de error y NO bloquea guardar manual", async () => {
    const toastErrorSpy = vi.spyOn(toast, "error").mockImplementation(() => 0 as any);
    fetchPadronMock.mockRejectedValue(new Error("El CUIT no existe en el padrón de ARCA"));

    const submitCustomer = vi.fn();
    (useCreateCustomer as any).mockReturnValue({
      submitCustomer,
      loadingCustomer: false,
    });

    renderCustomers();
    fireEvent.click(screen.getByRole("button", { name: "Agregar cliente" }));

    const cuitInput = screen.getByLabelText("CUIT") as HTMLInputElement;
    fireEvent.change(cuitInput, { target: { value: "20123456786" } });
    fireEvent.click(screen.getByRole("button", { name: "Consultar ARCA" }));

    await waitFor(() => {
      expect(toastErrorSpy).toHaveBeenCalled();
    });

    // El usuario puede seguir cargando a mano y guardar
    fireEvent.change(screen.getByLabelText("Nombre"), {
      target: { value: "Cliente manual" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(submitCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Cliente manual" }),
      expect.anything(),
    );

    toastErrorSpy.mockRestore();
  });
});

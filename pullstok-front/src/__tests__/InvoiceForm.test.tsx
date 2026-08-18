import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({}),
}));

vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/components/hooks/useCustomer", () => ({
  useCustomers: vi.fn(),
}));

vi.mock("@/components/hooks/useInvoices", () => ({
  useCreateInvoice: vi.fn(),
  useGetInvoiceById: vi.fn(),
  useUpdateInvoice: vi.fn(),
}));

vi.mock("@/services/priceLists", () => ({
  searchProducts: vi.fn(),
}));

import { InvoiceForm } from "@/views/InvoiceForm";
import { useCustomers } from "@/components/hooks/useCustomer";
import {
  useCreateInvoice,
  useGetInvoiceById,
  useUpdateInvoice,
} from "@/components/hooks/useInvoices";
import { searchProducts } from "@/services/priceLists";

const mockUseCustomers = vi.mocked(useCustomers);
const mockUseCreateInvoice = vi.mocked(useCreateInvoice);
const mockUseGetInvoiceById = vi.mocked(useGetInvoiceById);
const mockUseUpdateInvoice = vi.mocked(useUpdateInvoice);
const mockSearch = vi.mocked(searchProducts);

const renderForm = () => render(<InvoiceForm />);

describe("InvoiceForm — buscador de productos con autocompletado de precio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCustomers.mockReturnValue({
      customers: [],
      loadingCustomer: false,
      errorCustomer: null,
    });
    mockUseCreateInvoice.mockReturnValue({
      submitInvoice: vi.fn(),
      loadingCreate: false,
    });
    mockUseGetInvoiceById.mockReturnValue({
      invoice: undefined,
      loadingInvoice: false,
      errorInvoice: null,
    });
    mockUseUpdateInvoice.mockReturnValue({
      editInvoice: vi.fn(),
      loadingUpdate: false,
    });
  });

  it("escribir en el buscador + Enter llama a searchProducts con el término", async () => {
    mockSearch.mockResolvedValue([]);
    renderForm();

    const input = screen.getByLabelText("Buscar producto");
    fireEvent.change(input, { target: { value: "collar" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(mockSearch).toHaveBeenCalledWith("collar"));
  });

  it("elegir un resultado autocompleta description y unitPrice en la línea", async () => {
    mockSearch.mockResolvedValue([
      { id: "p1", name: "Collar de Cuero", price: 1500 },
    ]);
    renderForm();

    const input = screen.getByLabelText("Buscar producto");
    fireEvent.change(input, { target: { value: "collar" } });
    fireEvent.keyDown(input, { key: "Enter" });

    const resultados = await screen.findByTestId("product-search-results");
    expect(within(resultados).getByText("Collar de Cuero")).toBeInTheDocument();

    fireEvent.click(within(resultados).getByText("Collar de Cuero"));

    expect(input).toHaveValue("Collar de Cuero");
    const price = screen.getByTestId("unit-price-0") as HTMLInputElement;
    expect(price.value).toBe("1500");
  });

  it("el unitPrice sigue siendo editable a mano después de elegir el producto", async () => {
    mockSearch.mockResolvedValue([
      { id: "p1", name: "Collar de Cuero", price: 1500 },
    ]);
    renderForm();

    const input = screen.getByLabelText("Buscar producto");
    fireEvent.change(input, { target: { value: "collar" } });
    fireEvent.keyDown(input, { key: "Enter" });

    const resultados = await screen.findByTestId("product-search-results");
    fireEvent.click(within(resultados).getByText("Collar de Cuero"));

    const price = screen.getByTestId("unit-price-0") as HTMLInputElement;
    fireEvent.change(price, { target: { value: "2000" } });
    expect(price.value).toBe("2000");
    expect(input).toHaveValue("Collar de Cuero");
  });

  it("muestra 'Sin resultados' cuando la búsqueda no encuentra nada", async () => {
    mockSearch.mockResolvedValue([]);
    renderForm();

    const input = screen.getByLabelText("Buscar producto");
    fireEvent.change(input, { target: { value: "no existe" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(await screen.findByTestId("product-search-empty")).toHaveTextContent(
      "Sin resultados",
    );
  });
});
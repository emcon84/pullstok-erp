import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));

vi.stubGlobal("fetch", mockFetch);

vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/services/priceKgTypes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/priceKgTypes")>();
  return {
    ...actual,
    listPriceKgTypes: vi.fn(),
    createPriceKgType: vi.fn(),
    updatePriceKgType: vi.fn(),
    deletePriceKgType: vi.fn(),
  };
});

vi.mock("@/services/productService", () => ({
  bulkKgPriceUpdate: vi.fn(),
}));

import { PriceKgUpdate } from "@/views/PriceKgUpdate";
import {
  listPriceKgTypes,
  createPriceKgType,
} from "@/services/priceKgTypes";
import { bulkKgPriceUpdate } from "@/services/productService";

const mockListPriceKgTypes = vi.mocked(listPriceKgTypes);
const mockCreatePriceKgType = vi.mocked(createPriceKgType);
const mockBulkKgPriceUpdate = vi.mocked(bulkKgPriceUpdate);

const brands = [
  { id: "b-1", value: "Acme" },
  { id: "b-2", value: "Zap" },
];

const types = [
  { id: "t-1", name: "Adulto", synonyms: ["Adult", "Maduro"] },
  { id: "t-2", name: "Cachorro", synonyms: ["Puppy"] },
];

const preview = {
  affected: 2,
  rows: [
    { id: "p-1", name: "Producto 1", currentPriceKg: 1000, newPriceKg: 2500 },
    { id: "p-2", name: "Producto 2", currentPriceKg: null, newPriceKg: 2500 },
  ],
};

function renderView() {
  return render(<PriceKgUpdate />);
}

describe("PriceKgUpdate — tipos y propagación por kilo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem("token", "test-token");
    mockFetch.mockResolvedValue({ ok: true, json: async () => brands });
    mockListPriceKgTypes.mockResolvedValue(types);
    mockBulkKgPriceUpdate.mockResolvedValue(preview);
  });

  it("carga y muestra marcas y tipos al montar", async () => {
    renderView();

    expect(await screen.findByText("Acme")).toBeInTheDocument();
    // La lista de tipos (sección A) muestra los nombres cargados.
    expect(await screen.findByText("Adulto")).toBeInTheDocument();
    expect(screen.getByText("Cachorro")).toBeInTheDocument();
    // El selector de tipo (sección B) es un combobox Radix presente en el DOM.
    expect(screen.getByRole("combobox", { name: /tipo/i })).toBeInTheDocument();
  });

  it("muestra la vista previa al calcular", async () => {
    renderView();

    fireEvent.click(await screen.findByText("Acme"));
    // Abrir el combobox de tipo y elegir "Adulto" (Radix Select).
    fireEvent.click(screen.getByRole("combobox", { name: /tipo/i }));
    fireEvent.click(await screen.findByRole("option", { name: "Adulto" }));
    fireEvent.change(screen.getByLabelText(/precio por kilo/i), {
      target: { value: "2500" },
    });

    fireEvent.click(screen.getByRole("button", { name: /calcular preview/i }));

    expect(await screen.findByText("Producto 1")).toBeInTheDocument();
    expect(screen.getByText("Producto 2")).toBeInTheDocument();
    expect(screen.getAllByText("$2.500,00")).toHaveLength(2);
    expect(screen.getByText("Afectados")).toBeInTheDocument();
  });

  it("deshabilita el botón Aplicar sin preview", async () => {
    renderView();
    await screen.findByText("Acme");

    expect(screen.getByRole("button", { name: "Aplicar" })).toBeDisabled();
  });

  it("agrega un tipo desde el formulario", async () => {
    mockCreatePriceKgType.mockResolvedValue({
      id: "t-3",
      name: "Senior",
      synonyms: ["Senior"],
    });

    renderView();
    await screen.findByText("Adulto");

    fireEvent.change(screen.getByLabelText(/nombre/i), {
      target: { value: "Senior" },
    });
    fireEvent.change(screen.getByLabelText(/sinónimos/i), {
      target: { value: "Senior, Viejo, senior" },
    });

    fireEvent.click(screen.getByRole("button", { name: /agregar tipo/i }));

    await waitFor(() =>
      expect(mockCreatePriceKgType).toHaveBeenCalledWith({
        name: "Senior",
        synonyms: ["Senior", "Viejo"],
      }),
    );
  });
});

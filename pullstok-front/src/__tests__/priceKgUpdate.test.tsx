import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

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

vi.mock("@/services/priceKgBrands", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/priceKgBrands")>();
  return {
    ...actual,
    listPriceKgBrands: vi.fn(),
    createPriceKgBrand: vi.fn(),
    updatePriceKgBrand: vi.fn(),
    deletePriceKgBrand: vi.fn(),
  };
});

vi.mock("@/services/productService", () => ({
  bulkKgPriceUpdate: vi.fn(),
  listPriceKgProducts: vi.fn(),
}));

import { PriceKgUpdate } from "@/views/PriceKgUpdate";
import {
  listPriceKgTypes,
  createPriceKgType,
} from "@/services/priceKgTypes";
import { listPriceKgBrands } from "@/services/priceKgBrands";
import { bulkKgPriceUpdate } from "@/services/productService";

const mockListPriceKgTypes = vi.mocked(listPriceKgTypes);
const mockCreatePriceKgType = vi.mocked(createPriceKgType);
const mockListPriceKgBrands = vi.mocked(listPriceKgBrands);
const mockBulkKgPriceUpdate = vi.mocked(bulkKgPriceUpdate);

const brands = [
  { id: "brand-1", name: "Acme", keywords: ["ACME"] },
  { id: "brand-2", name: "Zap", keywords: ["ZAP"] },
];

const types = [
  { id: "t-1", name: "Adulto", synonyms: ["Adult", "Maduro"] },
  { id: "t-2", name: "Cachorro", synonyms: ["Puppy"] },
];

const preview = {
  affected: 2,
  rows: [
    {
      id: "p-1",
      name: "Producto 1",
      typeId: "t-1",
      typeName: "Adulto",
      currentPriceKg: 1000,
      newPriceKg: 2500,
    },
    {
      id: "p-2",
      name: "Producto 2",
      typeId: "t-2",
      typeName: "Cachorro",
      currentPriceKg: null,
      newPriceKg: 3000,
    },
  ],
};

function renderView() {
  return render(<PriceKgUpdate />);
}

describe("PriceKgUpdate — tipos, marcas y propagación por kilo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem("token", "test-token");
    mockListPriceKgTypes.mockResolvedValue(types);
    mockListPriceKgBrands.mockResolvedValue(brands);
    mockBulkKgPriceUpdate.mockResolvedValue(preview);
  });

  it("carga y muestra marcas y tipos al montar", async () => {
    renderView();

    // La lista de tipos (sección A) muestra los nombres cargados.
    expect(await screen.findByText("Adulto")).toBeInTheDocument();
    expect(screen.getByText("Cachorro")).toBeInTheDocument();

    // La lista de marcas (sección B) muestra los nombres cargados.
    expect(await screen.findByText("Acme")).toBeInTheDocument();
    expect(screen.getByText("Zap")).toBeInTheDocument();

    // El selector de tipo (sección C) es un combobox Radix presente en el DOM.
    expect(screen.getByRole("combobox", { name: /tipo/i })).toBeInTheDocument();

    // El selector de marca (sección C) es un combobox Radix que lista las marcas.
    fireEvent.click(screen.getByRole("combobox", { name: /marca/i }));
    expect(await screen.findByRole("option", { name: "Acme" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Zap" })).toBeInTheDocument();
  });

  it("agrega múltiples entries y calcula preview", async () => {
    renderView();
    await screen.findByText("Adulto");
    await screen.findByText("Acme");

    // Seleccionar marca "Acme" (Radix Select, patrón storeSettingsForm).
    fireEvent.click(screen.getByRole("combobox", { name: /marca/i }));
    fireEvent.click(await screen.findByRole("option", { name: "Acme" }));

    // Primera fila: tipo "Adulto" + precio 2500.
    fireEvent.click(screen.getAllByRole("combobox", { name: /tipo/i })[0]);
    fireEvent.click(await screen.findByRole("option", { name: "Adulto" }));
    fireEvent.change(screen.getAllByLabelText(/precio por kilo/i)[0], {
      target: { value: "2500" },
    });

    // Agregar una segunda fila.
    fireEvent.click(screen.getByRole("button", { name: /agregar otro tipo/i }));

    // Segunda fila: tipo "Cachorro" + precio 3000.
    fireEvent.click(screen.getAllByRole("combobox", { name: /tipo/i })[1]);
    fireEvent.click(await screen.findByRole("option", { name: "Cachorro" }));
    fireEvent.change(screen.getAllByLabelText(/precio por kilo/i)[1], {
      target: { value: "3000" },
    });

    fireEvent.click(screen.getByRole("button", { name: /calcular preview/i }));

    expect(await screen.findByText("Producto 1")).toBeInTheDocument();
    expect(screen.getByText("Producto 2")).toBeInTheDocument();
    expect(screen.getByText("Afectados")).toBeInTheDocument();
    expect(mockBulkKgPriceUpdate).toHaveBeenCalledWith(
      {
        brandId: "brand-1",
        entries: [
          { typeId: "t-1", priceKg: 2500 },
          { typeId: "t-2", priceKg: 3000 },
        ],
      },
      true,
    );
  });

  it("deshabilita el botón Aplicar sin preview", async () => {
    renderView();
    await screen.findByText("Adulto");

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

    fireEvent.change(screen.getByLabelText("Nombre", { selector: "#type-name" }), {
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

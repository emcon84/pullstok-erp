import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
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

vi.mock("@/services/priceKgPlan", () => ({
  getPriceKgPlan: vi.fn(),
  savePriceKgPlan: vi.fn(),
}));

import { PriceKgUpdate } from "@/views/PriceKgUpdate";
import {
  listPriceKgTypes,
  createPriceKgType,
} from "@/services/priceKgTypes";
import { listPriceKgBrands } from "@/services/priceKgBrands";
import { getPriceKgPlan, savePriceKgPlan } from "@/services/priceKgPlan";

const mockListPriceKgTypes = vi.mocked(listPriceKgTypes);
const mockCreatePriceKgType = vi.mocked(createPriceKgType);
const mockListPriceKgBrands = vi.mocked(listPriceKgBrands);
const mockGetPriceKgPlan = vi.mocked(getPriceKgPlan);
const mockSavePriceKgPlan = vi.mocked(savePriceKgPlan);

const brands = [
  { id: "brand-1", name: "Acme", keywords: ["ACME"] },
  { id: "brand-2", name: "Zap", keywords: ["ZAP"] },
];

const types = [
  { id: "t-1", name: "Adulto", synonyms: ["Adult", "Maduro"] },
  { id: "t-2", name: "Cachorro", synonyms: ["Puppy"] },
];

function renderView() {
  return render(<PriceKgUpdate />);
}

describe("PriceKgUpdate — tipos, marcas y planilla por kilo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem("token", "test-token");
    mockListPriceKgTypes.mockResolvedValue(types);
    mockListPriceKgBrands.mockResolvedValue(brands);
    mockGetPriceKgPlan.mockResolvedValue([]);
    mockSavePriceKgPlan.mockResolvedValue({ saved: 0 });
  });

  it("carga marcas y tipos y muestra la matriz con celdas precargadas", async () => {
    mockGetPriceKgPlan.mockResolvedValue([
      { id: "c1", brandId: "brand-1", typeId: "t-1", priceKg: 2500 },
    ]);

    renderView();

    // La lista de tipos (sección A) muestra los nombres cargados (también
    // aparecen como columnas de la matriz, por eso findAllByText).
    fireEvent.click(
      screen.getByRole("button", { name: /tipos \(etapas de vida\)/i }),
    );
    expect(await screen.findAllByText("Adulto")).not.toHaveLength(0);
    expect(screen.getAllByText("Cachorro")).not.toHaveLength(0);

    // La lista de marcas (sección B) muestra los nombres cargados.
    fireEvent.click(
      screen.getByRole("button", { name: /marcas \(líneas \/ sabores\)/i }),
    );
    expect(await screen.findAllByText("Acme")).not.toHaveLength(0);
    expect(screen.getAllByText("Zap")).not.toHaveLength(0);

    // La matriz (sección C) muestra un input por celda marca × tipo.
    const acmeAdulto = await screen.findByLabelText("Acme Adulto");
    expect(acmeAdulto).toHaveValue(2500);
    expect(screen.getByLabelText("Acme Cachorro")).toHaveValue(null);
    expect(screen.getByLabelText("Zap Adulto")).toHaveValue(null);

    // Indicador de celdas cargadas.
    expect(screen.getByText(/1 celda con precio cargadas/)).toBeInTheDocument();
  });

  it("guarda la planilla con celdas con precio y celdas vacías → null", async () => {
    mockGetPriceKgPlan.mockResolvedValue([
      { id: "c1", brandId: "brand-1", typeId: "t-1", priceKg: 2500 },
      { id: "c2", brandId: "brand-2", typeId: "t-1", priceKg: 5000 },
    ]);

    renderView();

    const acmeAdulto = await screen.findByLabelText("Acme Adulto");
    // Vacía una celda que tenía valor previo → se borra (priceKg null).
    fireEvent.change(acmeAdulto, { target: { value: "" } });

    // Celda nueva con precio.
    fireEvent.change(screen.getByLabelText("Zap Cachorro"), {
      target: { value: "3000" },
    });

    fireEvent.click(screen.getByRole("button", { name: /guardar planilla/i }));

    await waitFor(() =>
      expect(mockSavePriceKgPlan).toHaveBeenCalledWith([
        { brandId: "brand-1", typeId: "t-1", priceKg: null },
        { brandId: "brand-2", typeId: "t-1", priceKg: 5000 },
        { brandId: "brand-2", typeId: "t-2", priceKg: 3000 },
      ]),
    );
  });

  it("muestra el botón Imprimir planilla", async () => {
    renderView();
    await screen.findAllByText("Adulto");

    expect(
      screen.getByRole("button", { name: /imprimir planilla/i }),
    ).toBeInTheDocument();
  });

  it("agrega un tipo desde el formulario", async () => {
    mockCreatePriceKgType.mockResolvedValue({
      id: "t-3",
      name: "Senior",
      synonyms: ["Senior"],
    });

    renderView();
    await screen.findAllByText("Adulto");

    // El formulario vive dentro del acordeón colapsado: lo abrimos primero.
    fireEvent.click(
      screen.getByRole("button", { name: /tipos \(etapas de vida\)/i }),
    );
    await screen.findByLabelText("Nombre", { selector: "#type-name" });

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

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/services/priceKgTypes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/priceKgTypes")>();
  return {
    ...actual,
    listPriceKgTypes: vi.fn(),
  };
});

vi.mock("@/services/priceKgBrands", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/priceKgBrands")>();
  return {
    ...actual,
    listPriceKgBrands: vi.fn(),
  };
});

vi.mock("@/services/priceKgPlan", () => ({
  getPriceKgPlan: vi.fn(),
  savePriceKgPlan: vi.fn(),
}));

import { PriceKgLookup } from "@/views/PriceKgLookup";
import {
  listPriceKgTypes,
  type PriceKgType,
} from "@/services/priceKgTypes";
import {
  listPriceKgBrands,
  type PriceKgBrand,
} from "@/services/priceKgBrands";
import { getPriceKgPlan, type PriceKgPrice } from "@/services/priceKgPlan";

const mockListPriceKgTypes = vi.mocked(listPriceKgTypes);
const mockListPriceKgBrands = vi.mocked(listPriceKgBrands);
const mockGetPriceKgPlan = vi.mocked(getPriceKgPlan);

const brands: PriceKgBrand[] = [
  { id: "brand-1", name: "Acme", keywords: ["ACME"], species: "AMBOS" },
  { id: "brand-2", name: "Zap", keywords: ["ZAP"], species: "PERRO" },
];

const types: PriceKgType[] = [
  { id: "t-1", name: "Adulto", synonyms: [], species: "AMBOS" },
  { id: "t-2", name: "Kitten", synonyms: [], species: "GATO" },
];

// Celda distinta por especie para la misma marca×tipo AMBOS (Acme × Adulto):
// 2500 en Perros, 9000 en Gatos. Replica el bug AMBOS de PriceKgUpdate.
const planCells: PriceKgPrice[] = [
  { id: "c1", brandId: "brand-1", typeId: "t-1", priceKg: 2500, species: "PERRO" },
  { id: "c2", brandId: "brand-1", typeId: "t-1", priceKg: 9000, species: "GATO" },
];

function renderView() {
  return render(<PriceKgLookup />);
}

describe("PriceKgLookup — consulta de precios por kilo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem("token", "test-token");
    mockListPriceKgTypes.mockResolvedValue(types);
    mockListPriceKgBrands.mockResolvedValue(brands);
    mockGetPriceKgPlan.mockResolvedValue(planCells);
  });

  it("busca 'acme' y muestra la tarjeta con Adulto a $2.500,00 (planilla Perro)", async () => {
    renderView();

    const input = screen.getByPlaceholderText(/buscá una marca/i);
    fireEvent.change(input, { target: { value: "acme" } });

    expect(
      await screen.findByRole("heading", { name: "Acme" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Adulto")).toBeInTheDocument();
    expect(screen.getByText("$2.500,00")).toBeInTheDocument();
  });

  it("busca 'zap', y luego una marca inexistente muestra 'Sin resultados'", async () => {
    renderView();

    const input = screen.getByPlaceholderText(/buscá una marca/i);

    fireEvent.change(input, { target: { value: "zap" } });
    expect(
      await screen.findByRole("heading", { name: "Zap" }),
    ).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "noexiste" } });
    expect(await screen.findByText(/sin resultados/i)).toBeInTheDocument();
  });

  it("al cambiar a Gatos, Adulto pasa a $9.000,00 y aparece Kitten", async () => {
    renderView();

    const input = screen.getByPlaceholderText(/buscá una marca/i);
    fireEvent.change(input, { target: { value: "acme" } });

    // Planilla Perro activa (default): Acme × Adulto = 2500.
    expect(await screen.findByText("$2.500,00")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /gatos/i }));

    // Misma marca×tipo AMBOS ahora muestra la celda GATO (9000) y Kitten
    // (tipo GATO) se vuelve visible.
    expect(await screen.findByText("$9.000,00")).toBeInTheDocument();
    expect(screen.getByText("Kitten")).toBeInTheDocument();
  });

  it("sin búsqueda muestra el estado vacío y no renderiza tarjetas de marca", async () => {
    renderView();

    // Espera a que termine la carga (loader con "Cargando...").
    await waitFor(() =>
      expect(screen.queryByText(/cargando/i)).not.toBeInTheDocument(),
    );

    expect(
      screen.getByText(/escribí el nombre de una marca/i),
    ).toBeInTheDocument();
    // El título de la página es "Precios por kilo", así que "Acme"/"Zap" solo
    // podrían venir de tarjetas de marca.
    expect(screen.queryAllByText("Acme")).toHaveLength(0);
    expect(screen.queryAllByText("Zap")).toHaveLength(0);
  });
});
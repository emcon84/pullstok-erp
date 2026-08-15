import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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

vi.mock("@/services/priceKgReview", () => ({
  listProductsForCell: vi.fn(),
}));

vi.mock("@/services/saleServices", () => ({
  createSale: vi.fn(),
  deleteSale: vi.fn(),
  getSales: vi.fn(),
}));

vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
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
import { listProductsForCell } from "@/services/priceKgReview";
import { createSale } from "@/services/saleServices";
import { toast } from "react-toastify";

const mockListPriceKgTypes = vi.mocked(listPriceKgTypes);
const mockListPriceKgBrands = vi.mocked(listPriceKgBrands);
const mockGetPriceKgPlan = vi.mocked(getPriceKgPlan);
const mockListProductsForCell = vi.mocked(listProductsForCell);
const mockCreateSale = vi.mocked(createSale);
const toastErrorMock = vi.mocked(toast.error);
const toastSuccessMock = vi.mocked(toast.success);

const brands: PriceKgBrand[] = [
  { id: "brand-1", name: "Acme", keywords: ["ACME"], species: "AMBOS" },
  { id: "brand-2", name: "Zap", keywords: ["ZAP"], species: "PERRO" },
];

const types: PriceKgType[] = [
  { id: "t-1", name: "Adulto", synonyms: [], species: "AMBOS" },
  { id: "t-2", name: "Kitten", synonyms: [], species: "GATO" },
];

// Celda distinta por especie para la misma marca×tipo AMBOS (Acme × Adulto):
// 2500 en Perros, 9000 en Gatos. Los precios sueltos SIEMPRE son redondos.
const planCells: PriceKgPrice[] = [
  { id: "c1", brandId: "brand-1", typeId: "t-1", priceKg: 2500, species: "PERRO" },
  { id: "c2", brandId: "brand-1", typeId: "t-1", priceKg: 9000, species: "GATO" },
];

function renderView() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PriceKgLookup />
    </QueryClientProvider>,
  );
}

describe("PriceKgLookup — consulta de precios por kilo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem("token", "test-token");
    mockListPriceKgTypes.mockResolvedValue(types);
    mockListPriceKgBrands.mockResolvedValue(brands);
    mockGetPriceKgPlan.mockResolvedValue(planCells);
    mockListProductsForCell.mockResolvedValue([
      {
        id: "p1",
        name: "ACME ADULTO PERRO 12KG",
        weightKg: 12,
        stock: 5,
        priceKgSuelto: 7500,
        category: "Alimento Seco Perro",
        exact: true,
      },
    ]);
    mockCreateSale.mockResolvedValue({ message: "ok" });
  });

  it("muestra AMBOS precios a la vez (Perro y Gato) para una marca/tipo AMBOS", async () => {
    renderView();

    const input = screen.getByPlaceholderText(/buscá una marca/i);
    fireEvent.change(input, { target: { value: "acme" } });

    expect(
      await screen.findByRole("heading", { name: "Acme" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Adulto")).toBeInTheDocument();

    // Sin selector: la misma marca×tipo muestra su precio Perro y su precio
    // Gato juntos, etiquetados, y sin decimales (precios sueltos redondos).
    expect(screen.getAllByText("Perro").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Gato").length).toBeGreaterThan(0);
    expect(screen.getByText("$2.500")).toBeInTheDocument();
    expect(screen.getByText("$9.000")).toBeInTheDocument();
  });

  it("un tipo GATO-only (Kitten) muestra solo su precio de Gato", async () => {
    renderView();

    const input = screen.getByPlaceholderText(/buscá una marca/i);
    fireEvent.change(input, { target: { value: "acme" } });
    await screen.findByRole("heading", { name: "Acme" });

    // Kitten (species GATO) NO muestra el badge Perro; muestra el de Gato con
    // "—" porque no tiene celda cargada.
    expect(screen.getByText("Kitten")).toBeInTheDocument();
    expect(screen.queryByText("Perro")).toBeInTheDocument(); // del bloque Adulto
    // Kitten no tiene badge Perro: contamos los badges "Perro" — solo 1 (Adulto).
    expect(screen.getAllByText("Perro")).toHaveLength(1);
    expect(screen.getAllByText("Gato")).toHaveLength(2); // Adulto + Kitten
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

  // ── sdd/precios-suelto-planilla: celdas interactivas (panel de venta suelta) ──

  async function searchAcme() {
    const input = screen.getByPlaceholderText(/buscá una marca/i);
    fireEvent.change(input, { target: { value: "acme" } });
    await screen.findByRole("heading", { name: "Acme" });
  }

  it("una celda CON precio es clickeable y abre el panel de venta suelta", async () => {
    renderView();
    await searchAcme();

    // Celda Perro de Acme × Adulto ($2.500) → botón accesible.
    const cellButton = screen.getByRole("button", {
      name: /abrir venta suelta.*acme.*adulto.*perro/i,
    });
    fireEvent.click(cellButton);

    expect(await screen.findByText(/venta suelta/i)).toBeInTheDocument();
    expect(mockListProductsForCell).toHaveBeenCalledWith({
      brandId: "brand-1",
      typeId: "t-1",
      species: "PERRO",
    });
    // El panel lista el producto de la celda.
    expect(await screen.findByText("ACME ADULTO PERRO 12KG")).toBeInTheDocument();
  });

  it("una celda SIN precio (—) no abre el panel", async () => {
    renderView();
    await searchAcme();

    // Kitten (GATO, sin celda) muestra "—" y NO es botón clickeable.
    const dash = screen
      .getAllByText("—")
      .find((el) => el.closest("button") === null);
    expect(dash).toBeDefined();
    fireEvent.click(dash!);

    expect(screen.queryByText(/venta suelta/i)).not.toBeInTheDocument();
    expect(mockListProductsForCell).not.toHaveBeenCalled();
  });

  it("vender directo usa el precio de la CELDA (no el priceKgSuelto del producto)", async () => {
    renderView();
    await searchAcme();

    fireEvent.click(
      screen.getByRole("button", {
        name: /abrir venta suelta.*acme.*adulto.*perro/i,
      }),
    );
    await screen.findByText("ACME ADULTO PERRO 12KG");

    // Selecciona el producto, pide 2 kg y vende.
    fireEvent.click(screen.getByText("ACME ADULTO PERRO 12KG"));
    fireEvent.change(screen.getByLabelText("Kilogramos"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /vender directo/i }));

    await waitFor(() => {
      // El payload de la venta lleva price = celda ($2.500), no 7500.
      expect(mockCreateSale).toHaveBeenCalledWith(
        expect.objectContaining({
          products: [
            expect.objectContaining({
              productId: "p1",
              quantity: "2",
              price: "2500", // ← celda, no product.priceKgSuelto (7500)
              saleMode: "POR_PESO",
            }),
          ],
        }),
        undefined,
      );
    });
    expect(toastSuccessMock).toHaveBeenCalledWith(expect.stringContaining("ACME ADULTO PERRO 12KG"));
  });

  it("sin stock en la celda: aborta la venta con toast de error", async () => {
    mockListProductsForCell.mockResolvedValue([
      {
        id: "p1",
        name: "ACME ADULTO PERRO 12KG",
        weightKg: 12,
        stock: 0,
        priceKgSuelto: 7500,
        category: "Alimento Seco Perro",
        exact: true,
      },
    ]);
    renderView();
    await searchAcme();

    fireEvent.click(
      screen.getByRole("button", {
        name: /abrir venta suelta.*acme.*adulto.*perro/i,
      }),
    );
    await screen.findByText("ACME ADULTO PERRO 12KG");
    fireEvent.click(screen.getByText("ACME ADULTO PERRO 12KG"));
    fireEvent.change(screen.getByLabelText("Kilogramos"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /vender directo/i }));

    expect(toastErrorMock).toHaveBeenCalledWith(expect.stringMatching(/sin stock/i));
    expect(mockCreateSale).not.toHaveBeenCalled();
  });

  it("agregar al pedido guarda el item en el carrito con el precio de la celda", async () => {
    renderView();
    await searchAcme();

    fireEvent.click(
      screen.getByRole("button", {
        name: /abrir venta suelta.*acme.*adulto.*perro/i,
      }),
    );
    await screen.findByText("ACME ADULTO PERRO 12KG");

    fireEvent.click(screen.getByText("ACME ADULTO PERRO 12KG"));
    fireEvent.change(screen.getByLabelText("Kilogramos"), {
      target: { value: "1.5" },
    });
    fireEvent.click(screen.getByRole("button", { name: /agregar al pedido/i }));

    const cart = JSON.parse(localStorage.getItem("vendor-cart") || "[]");
    expect(cart).toEqual([
      expect.objectContaining({
        productId: "p1",
        name: "ACME ADULTO PERRO 12KG",
        price: 2500, // ← celda, no 7500
        priceKgSuelto: 2500,
        quantity: 1.5,
        saleMode: "POR_PESO",
      }),
    ]);
  });
});

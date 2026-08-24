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

vi.mock("@/services/looseStock", () => ({
  getLooseStock: vi.fn(),
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
import { getLooseStock } from "@/services/looseStock";
import { createSale } from "@/services/saleServices";
import { toast } from "react-toastify";

const mockListPriceKgTypes = vi.mocked(listPriceKgTypes);
const mockListPriceKgBrands = vi.mocked(listPriceKgBrands);
const mockGetPriceKgPlan = vi.mocked(getPriceKgPlan);
const mockGetLooseStock = vi.mocked(getLooseStock);
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
    mockGetLooseStock.mockResolvedValue({
      id: "ls-1",
      priceKgPriceId: "c1",
      branchId: "b1",
      quantity: 15.5,
      lineName: "Acme · Adulto",
      branchName: "Sucursal 1",
    });
    mockCreateSale.mockResolvedValue(undefined);
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

  // ── sdd/precios-suelto-planilla: celdas interactivas (modal de venta suelta) ──

  async function searchAcme() {
    const input = screen.getByPlaceholderText(/buscá una marca/i);
    fireEvent.change(input, { target: { value: "acme" } });
    await screen.findByRole("heading", { name: "Acme" });
  }

  it("una celda CON precio abre el modal de venta suelta con la celda directo", async () => {
    renderView();
    await searchAcme();

    // Celda Perro de Acme × Adulto ($2.500) → botón accesible.
    const cellButton = screen.getByRole("button", {
      name: /abrir venta suelta.*acme.*adulto.*perro/i,
    });
    fireEvent.click(cellButton);

    // El modal abre con la línea de la CELDA: título "Acme · Adulto", el
    // precio de la celda ($/kg) como autoritativo... sin buscar productos.
    expect(await screen.findByRole("heading", { name: "Acme · Adulto" })).toBeInTheDocument();
    expect(screen.getByText("Perros")).toBeInTheDocument();
    expect(screen.getAllByText("$2.500/kg").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Por kilo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Por monto" })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/buscar producto/i)).not.toBeInTheDocument();
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

    expect(screen.queryByText("Acme · Adulto")).not.toBeInTheDocument();
    expect(mockGetLooseStock).not.toHaveBeenCalled();
  });

  it("vender directo usa el precio de la CELDA y manda loosePriceId (no productId)", async () => {
    renderView();
    await searchAcme();

    fireEvent.click(
      screen.getByRole("button", {
        name: /abrir venta suelta.*acme.*adulto.*perro/i,
      }),
    );
    await screen.findByRole("heading", { name: "Acme · Adulto" });

    // Pide 2 kg y vende directo desde la celda.
    fireEvent.change(screen.getByLabelText("Kilogramos"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /vender directo/i }));

    await waitFor(() => {
      // El payload de la venta lleva price = celda ($2.500), nombre de línea
      // "Acme · Adulto", y la línea se identifica por loosePriceId (celda c1)
      // SIN productId: así el backend descuenta los kg del LooseStock de la
      // celda.
      expect(mockCreateSale).toHaveBeenCalledWith(
        expect.objectContaining({
          products: [
            expect.objectContaining({
              loosePriceId: "c1",
              looseName: "Acme · Adulto",
              quantity: "2",
              name: "Acme · Adulto",
              price: "2500", // ← celda, no ningún priceKgSuelto de producto
              saleMode: "POR_PESO",
            }),
          ],
        }),
        undefined,
      );
      const payload = mockCreateSale.mock.calls[0][0];
      expect(payload.products[0]).not.toHaveProperty("productId");
    });
    expect(toastSuccessMock).toHaveBeenCalledWith(
      expect.stringContaining("Acme · Adulto"),
    );
  });

  it("vender directo manda payments default EFECTIVO por el total (R7)", async () => {
    renderView();
    await searchAcme();

    fireEvent.click(
      screen.getByRole("button", {
        name: /abrir venta suelta.*acme.*adulto.*perro/i,
      }),
    );
    await screen.findByRole("heading", { name: "Acme · Adulto" });

    // Pide 2 kg y vende directo desde la celda: no se declara ningún método →
    // el payload debe traer EFECTIVO por el total (round2(2500 * 2) = 5000).
    fireEvent.change(screen.getByLabelText("Kilogramos"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /vender directo/i }));

    await waitFor(() => {
      expect(mockCreateSale).toHaveBeenCalledWith(
        expect.objectContaining({
          payments: [{ method: "EFECTIVO", amount: 5000 }],
        }),
        undefined,
      );
    });
  });

  it("con sucursal y stock suelto en 0: aviso y vender deshabilitado", async () => {
    // VENDEDOR con sucursal → branchId resuelto; stock suelto 0 kg → el panel
    // bloquea la venta (el backend rechazaría "stock suelto insuficiente").
    localStorage.setItem(
      "user",
      JSON.stringify({ role: "VENDEDOR", branchIds: ["b1"] }),
    );
    mockGetLooseStock.mockResolvedValue({
      id: "ls-1",
      priceKgPriceId: "c1",
      branchId: "b1",
      quantity: 0,
      lineName: "Acme · Adulto",
      branchName: "Sucursal 1",
    });
    renderView();
    await searchAcme();

    fireEvent.click(
      screen.getByRole("button", {
        name: /abrir venta suelta.*acme.*adulto.*perro/i,
      }),
    );

    expect(
      await screen.findByText("Sin stock suelto cargado"),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Kilogramos"), {
      target: { value: "2" },
    });
    expect(
      screen.getByRole("button", { name: /vender directo/i }),
    ).toBeDisabled();
    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(mockCreateSale).not.toHaveBeenCalled();
  });

  it("agregar al pedido guarda el item suelto de la línea con precio y celda", async () => {
    renderView();
    await searchAcme();

    fireEvent.click(
      screen.getByRole("button", {
        name: /abrir venta suelta.*acme.*adulto.*perro/i,
      }),
    );
    await screen.findByRole("heading", { name: "Acme · Adulto" });

    fireEvent.change(screen.getByLabelText("Kilogramos"), {
      target: { value: "1.5" },
    });
    fireEvent.click(screen.getByRole("button", { name: /agregar al pedido/i }));

    const cart = JSON.parse(localStorage.getItem("vendor-cart") || "[]");
    expect(cart).toEqual([
      expect.objectContaining({
        productId: "c1", // la celda es el id del item sintético
        name: "Acme · Adulto",
        price: 2500, // ← celda, no ningún priceKgSuelto de producto
        priceKgSuelto: 2500,
        quantity: 1.5,
        saleMode: "POR_PESO",
        loosePriceId: "c1",
        looseName: "Acme · Adulto",
      }),
    ]);
    expect(toastSuccessMock).toHaveBeenCalledWith(
      expect.stringContaining("Acme · Adulto"),
    );
  });
});
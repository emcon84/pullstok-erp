import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import React from "react";

// Servicio + hook de "producto manual" (POST /products/manual): payload,
// Bearer, mensajes de error e invalidación de ["products"].
const { mockPost } = vi.hoisted(() => ({ mockPost: vi.fn() }));
vi.mock("axios", () => ({
  default: {
    post: mockPost,
    isAxiosError: (e: unknown) => !!(e as { isAxiosError?: boolean })?.isAxiosError,
  },
  isAxiosError: (e: unknown) => !!(e as { isAxiosError?: boolean })?.isAxiosError,
}));

import { createManualProduct } from "../services/productService";
import { useCreateManualProduct } from "../components/hooks/useCreateManualProduct";

describe("createManualProduct (service)", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("token", "test-token");
    mockPost.mockReset();
  });

  it("hace POST /products/manual con { name, price } y el Bearer", async () => {
    const created = { id: "p1", name: "TORNILLO", price: 1500, isManual: true };
    mockPost.mockResolvedValue({ data: created });

    const result = await createManualProduct({ name: "tornillo", price: 1500 });

    expect(result).toEqual(created);
    expect(mockPost).toHaveBeenCalledWith(
      expect.stringContaining("/products/manual"),
      { name: "tornillo", price: 1500 },
      { headers: { Authorization: "Bearer test-token" } },
    );
  });

  it("propaga el message del backend cuando la API responde error", async () => {
    mockPost.mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: "Datos inválidos" } },
    });

    await expect(createManualProduct({ name: "x", price: 1 })).rejects.toThrow(
      "Datos inválidos",
    );
  });

  it("usa un mensaje genérico ante un error que no es de axios", async () => {
    mockPost.mockRejectedValue(new Error("boom"));

    await expect(createManualProduct({ name: "x", price: 1 })).rejects.toThrow(
      "An unknown error occurred",
    );
  });
});

describe("useCreateManualProduct (hook)", () => {
  const productsFetch = vi.fn();

  function ProductsProbe() {
    useQuery({ queryKey: ["products"], queryFn: productsFetch });
    return null;
  }

  function Harness() {
    const { createManualProduct: create, creating } = useCreateManualProduct();
    return (
      <div>
        <span data-testid="creating">{String(creating)}</span>
        <button onClick={() => create({ name: "TUERCA", price: 300 }).catch(() => {})}>
          crear
        </button>
      </div>
    );
  }

  function renderWithClient(ui: React.ReactElement) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  }

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("token", "test-token");
    mockPost.mockReset();
    productsFetch.mockReset();
    productsFetch.mockResolvedValue([]);
  });

  it("llama al servicio con el payload y refresca la lista ['products'] al éxito", async () => {
    mockPost.mockResolvedValue({ data: { id: "p9", name: "TUERCA", price: 300 } });
    renderWithClient(
      <>
        <Harness />
        <ProductsProbe />
      </>,
    );
    await waitFor(() => expect(productsFetch).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "crear" }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        expect.stringContaining("/products/manual"),
        { name: "TUERCA", price: 300 },
        expect.anything(),
      ),
    );
    await waitFor(() => expect(productsFetch).toHaveBeenCalledTimes(2));
  });

  it("no invalida ['products'] cuando la API falla", async () => {
    mockPost.mockRejectedValue({ isAxiosError: true, response: { data: { message: "x" } } });
    renderWithClient(
      <>
        <Harness />
        <ProductsProbe />
      </>,
    );
    await waitFor(() => expect(productsFetch).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "crear" }));

    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId("creating")).toHaveTextContent("false"));
    expect(productsFetch).toHaveBeenCalledTimes(1);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import React from "react";

// Vista admin "Carga manual": servicio (GET /products/manual, POST
// /products/:id/promote) + hooks (query y mutation con invalidación).
const { mockGet, mockPost, mockDelete } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockDelete: vi.fn(),
}));
vi.mock("axios", () => ({
  default: {
    get: mockGet,
    post: mockPost,
    delete: mockDelete,
    isAxiosError: (e: unknown) => !!(e as { isAxiosError?: boolean })?.isAxiosError,
  },
  isAxiosError: (e: unknown) => !!(e as { isAxiosError?: boolean })?.isAxiosError,
}));

import {
  getManualProducts,
  promoteManualProduct,
  deleteManualProduct,
} from "../services/productService";
import { useManualProducts } from "../components/hooks/useManualProducts";
import { usePromoteManualProduct } from "../components/hooks/usePromoteManualProduct";
import { useDeleteManualProduct } from "../components/hooks/useDeleteManualProduct";

describe("getManualProducts (service)", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("token", "test-token");
    mockGet.mockReset();
  });

  it("hace GET /products/manual con el Bearer y devuelve la lista", async () => {
    const rows = [{ id: "p1", name: "TORNILLO", price: 1500, isManual: true }];
    mockGet.mockResolvedValue({ data: rows });

    const result = await getManualProducts();

    expect(result).toEqual(rows);
    expect(mockGet).toHaveBeenCalledWith(expect.stringContaining("/products/manual"), {
      headers: { Authorization: "Bearer test-token" },
    });
  });

  it("propaga el message del backend cuando la API responde error", async () => {
    mockGet.mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: "Sin permiso" } },
    });

    await expect(getManualProducts()).rejects.toThrow("Sin permiso");
  });

  it("usa un mensaje genérico ante un error que no es de axios", async () => {
    mockGet.mockRejectedValue(new Error("boom"));

    await expect(getManualProducts()).rejects.toThrow("An unknown error occurred");
  });
});

describe("promoteManualProduct (service)", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("token", "test-token");
    mockPost.mockReset();
  });

  it("hace POST /products/:id/promote con { categoryId } y el Bearer", async () => {
    const updated = { id: "p1", isManual: false, categoryId: "c9" };
    mockPost.mockResolvedValue({ data: updated });

    const result = await promoteManualProduct("p1", "c9");

    expect(result).toEqual(updated);
    expect(mockPost).toHaveBeenCalledWith(
      expect.stringMatching(/\/products\/p1\/promote$/),
      { categoryId: "c9" },
      { headers: { Authorization: "Bearer test-token" } },
    );
  });

  it("propaga el message del backend (400 categoría inválida / 404)", async () => {
    mockPost.mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: "Producto manual no encontrado" } },
    });

    await expect(promoteManualProduct("p1", "c9")).rejects.toThrow(
      "Producto manual no encontrado",
    );
  });

  it("usa un mensaje genérico ante un error que no es de axios", async () => {
    mockPost.mockRejectedValue(new Error("boom"));

    await expect(promoteManualProduct("p1", "c9")).rejects.toThrow(
      "An unknown error occurred",
    );
  });
});

describe("deleteManualProduct (service)", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("token", "test-token");
    mockDelete.mockReset();
  });

  it("hace DELETE /products/manual/:id con el Bearer y devuelve la respuesta", async () => {
    mockDelete.mockResolvedValue({ data: { message: "Producto eliminado" } });

    const result = await deleteManualProduct("p1");

    expect(result).toEqual({ message: "Producto eliminado" });
    expect(mockDelete).toHaveBeenCalledWith(
      expect.stringMatching(/\/products\/manual\/p1$/),
      { headers: { Authorization: "Bearer test-token" } },
    );
  });

  it("propaga el message del backend (409 en pedido/presupuesto)", async () => {
    mockDelete.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 409,
        data: { message: "No se puede eliminar: el producto está en un pedido o presupuesto" },
      },
    });

    await expect(deleteManualProduct("p1")).rejects.toThrow(
      "No se puede eliminar: el producto está en un pedido o presupuesto",
    );
  });

  it("el error conserva el status HTTP para que el llamador distinga el 404", async () => {
    mockDelete.mockRejectedValue({
      isAxiosError: true,
      response: { status: 404, data: { message: "Producto manual no encontrado" } },
    });

    await expect(deleteManualProduct("p1")).rejects.toMatchObject({
      message: "Producto manual no encontrado",
      status: 404,
    });
  });

  it("usa un mensaje genérico ante un error que no es de axios", async () => {
    mockDelete.mockRejectedValue(new Error("boom"));

    await expect(deleteManualProduct("p1")).rejects.toThrow("An unknown error occurred");
  });
});

function renderWithClient(ui: React.ReactElement, client?: QueryClient) {
  const qc = client ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("useManualProducts (hook)", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("token", "test-token");
    mockGet.mockReset();
  });

  function Probe() {
    const { products, loading, error } = useManualProducts();
    return (
      <div>
        <span data-testid="loading">{String(loading)}</span>
        <span data-testid="error">{error?.message ?? ""}</span>
        <span data-testid="names">{products.map((p) => p.name).join(",")}</span>
      </div>
    );
  }

  it("carga la lista y expone products/loading", async () => {
    mockGet.mockResolvedValue({ data: [{ id: "1", name: "A" }, { id: "2", name: "B" }] });
    renderWithClient(<Probe />);

    await waitFor(() => expect(screen.getByTestId("names")).toHaveTextContent("A,B"));
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
  });

  it("expone el error del backend y una lista vacía", async () => {
    mockGet.mockRejectedValue({ isAxiosError: true, response: { data: { message: "Sin permiso" } } });
    renderWithClient(<Probe />);

    await waitFor(() => expect(screen.getByTestId("error")).toHaveTextContent("Sin permiso"));
    expect(screen.getByTestId("names")).toHaveTextContent("");
  });
});

describe("usePromoteManualProduct (hook)", () => {
  const productsFetch = vi.fn();
  const manualFetch = vi.fn();

  function Probes() {
    useQuery({ queryKey: ["products"], queryFn: productsFetch });
    useQuery({ queryKey: ["manual-products"], queryFn: manualFetch });
    return null;
  }

  function Harness() {
    const { promote, promoting } = usePromoteManualProduct();
    return (
      <div>
        <span data-testid="promoting">{String(promoting)}</span>
        <button onClick={() => promote({ id: "p1", categoryId: "c9" }).catch(() => {})}>
          promover
        </button>
      </div>
    );
  }

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("token", "test-token");
    mockPost.mockReset();
    productsFetch.mockReset().mockResolvedValue([]);
    manualFetch.mockReset().mockResolvedValue([]);
  });

  it("llama al servicio con los ids y refresca ['products'] y la lista manual al éxito", async () => {
    mockPost.mockResolvedValue({ data: { id: "p1", isManual: false } });
    renderWithClient(
      <>
        <Harness />
        <Probes />
      </>,
    );
    await waitFor(() => expect(productsFetch).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(manualFetch).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "promover" }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        expect.stringMatching(/\/products\/p1\/promote$/),
        { categoryId: "c9" },
        expect.anything(),
      ),
    );
    await waitFor(() => expect(productsFetch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(manualFetch).toHaveBeenCalledTimes(2));
  });

  it("no invalida nada cuando la API falla", async () => {
    mockPost.mockRejectedValue({ isAxiosError: true, response: { data: { message: "x" } } });
    renderWithClient(
      <>
        <Harness />
        <Probes />
      </>,
    );
    await waitFor(() => expect(productsFetch).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(manualFetch).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "promover" }));

    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId("promoting")).toHaveTextContent("false"));
    expect(productsFetch).toHaveBeenCalledTimes(1);
    expect(manualFetch).toHaveBeenCalledTimes(1);
  });
});

describe("useDeleteManualProduct (hook)", () => {
  const productsFetch = vi.fn();
  const manualFetch = vi.fn();

  function Probes() {
    useQuery({ queryKey: ["products"], queryFn: productsFetch });
    useQuery({ queryKey: ["manual-products"], queryFn: manualFetch });
    return null;
  }

  function Harness() {
    const { deleteProduct, deleting } = useDeleteManualProduct();
    return (
      <div>
        <span data-testid="deleting">{String(deleting)}</span>
        <button onClick={() => deleteProduct("p1").catch(() => {})}>eliminar</button>
      </div>
    );
  }

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("token", "test-token");
    mockDelete.mockReset();
    productsFetch.mockReset().mockResolvedValue([]);
    manualFetch.mockReset().mockResolvedValue([]);
  });

  it("llama al servicio con el id y refresca ['products'] y la lista manual al éxito", async () => {
    mockDelete.mockResolvedValue({ data: { message: "Producto eliminado" } });
    renderWithClient(
      <>
        <Harness />
        <Probes />
      </>,
    );
    await waitFor(() => expect(productsFetch).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(manualFetch).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "eliminar" }));

    await waitFor(() =>
      expect(mockDelete).toHaveBeenCalledWith(
        expect.stringMatching(/\/products\/manual\/p1$/),
        expect.anything(),
      ),
    );
    await waitFor(() => expect(productsFetch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(manualFetch).toHaveBeenCalledTimes(2));
  });

  it("no invalida nada cuando la API falla", async () => {
    mockDelete.mockRejectedValue({
      isAxiosError: true,
      response: { status: 409, data: { message: "x" } },
    });
    renderWithClient(
      <>
        <Harness />
        <Probes />
      </>,
    );
    await waitFor(() => expect(productsFetch).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(manualFetch).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "eliminar" }));

    await waitFor(() => expect(mockDelete).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId("deleting")).toHaveTextContent("false"));
    expect(productsFetch).toHaveBeenCalledTimes(1);
    expect(manualFetch).toHaveBeenCalledTimes(1);
  });
});

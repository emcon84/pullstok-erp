import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@/services/productService", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/productService")>();
  return { ...actual, products: vi.fn() };
});

import { useProducts } from "@/components/hooks/useProducts";
import { products } from "@/services/productService";

const mockProducts = vi.mocked(products);

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

const wrapperFor = (client: QueryClient) => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

describe("useProducts — cache del lado del cliente (lista completa ~5,7 MB)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProducts.mockResolvedValue([{ _id: "p1", name: "A" }] as never);
  });

  it("volver a montar dentro de la ventana de frescura NO vuelve a bajar la lista", async () => {
    const client = makeClient();
    const first = renderHook(() => useProducts(), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(first.result.current.products).toHaveLength(1));
    first.unmount();

    // Se navega a otra pantalla y se vuelve al Dashboard: mismo QueryClient.
    const second = renderHook(() => useProducts(), { wrapper: wrapperFor(client) });

    expect(second.result.current.products).toHaveLength(1);
    expect(mockProducts).toHaveBeenCalledTimes(1);
  });

  it("una mutación (invalidateQueries de products) sigue refrescando la lista", async () => {
    const client = makeClient();
    const { result } = renderHook(() => useProducts(), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.products).toHaveLength(1));
    expect(mockProducts).toHaveBeenCalledTimes(1);

    await act(async () => {
      await client.invalidateQueries({ queryKey: ["products"] });
    });

    await waitFor(() => expect(mockProducts).toHaveBeenCalledTimes(2));
  });
});

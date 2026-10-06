import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@/services/productService", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/productService")>();
  return { ...actual, products: vi.fn() };
});

import { useInfiniteProducts } from "@/components/hooks/useProducts";
import { products } from "@/services/productService";

const mockProducts = vi.mocked(products);

const wrapperFor = (client: QueryClient) => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

const makeClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe("useInfiniteProducts — enabled flag", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProducts.mockResolvedValue({
      items: [{ _id: "p1", name: "A" }],
      page: 1,
      hasMore: false,
    } as never);
  });

  it("does not fetch while enabled is false", async () => {
    const { result } = renderHook(
      () =>
        useInfiniteProducts(
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          false,
        ),
      { wrapper: wrapperFor(makeClient()) },
    );
    await new Promise((r) => setTimeout(r, 30));
    expect(mockProducts).not.toHaveBeenCalled();
    expect(result.current.items).toHaveLength(0);
  });

  it("fetches by default (existing callers unaffected)", async () => {
    const { result } = renderHook(() => useInfiniteProducts(), {
      wrapper: wrapperFor(makeClient()),
    });
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(mockProducts).toHaveBeenCalledTimes(1);
  });

  it("starts fetching once enabled flips to true", async () => {
    let enabled = false;
    const { result, rerender } = renderHook(
      () =>
        useInfiniteProducts(
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          enabled,
        ),
      { wrapper: wrapperFor(makeClient()) },
    );
    expect(mockProducts).not.toHaveBeenCalled();
    enabled = true;
    rerender();
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(mockProducts).toHaveBeenCalledTimes(1);
  });
});

// Regresión: SalesDrawer (useInfiniteProducts sin filtros) y el Dashboard
// (useProducts sin filtros) compartían la clave ["products"]; el observer
// infinito leía el array plano del cache como {pages} y rompía con
// "Cannot read properties of undefined (reading 'length')".
describe("useInfiniteProducts — no comparte cache con useProducts", () => {
  it("does not crash when useProducts already cached a plain array under the same filters", async () => {
    const { useProducts } = await import("@/components/hooks/useProducts");
    mockProducts.mockImplementation(((
      _branch?: string,
      _search?: string,
      _category?: string,
      page?: unknown,
    ) =>
      page === undefined
        ? Promise.resolve([{ _id: "p1", name: "A", quantity: 1 }])
        : Promise.resolve({
            items: [{ _id: "p1", name: "A", quantity: 1 }],
            total: 1,
            page: 1,
            pageSize: 30,
            hasMore: false,
          })) as never);

    const client = makeClient();
    const { result } = renderHook(
      () => ({
        plain: useProducts(),
        infinite: useInfiniteProducts(undefined, undefined, undefined, undefined, undefined, undefined, true),
      }),
      { wrapper: wrapperFor(client) },
    );

    await waitFor(() => expect(result.current.plain.products).toHaveLength(1));
    await waitFor(() => expect(result.current.infinite.items).toHaveLength(1));
    expect(result.current.infinite.hasNextPage).toBe(false);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@/services/productService", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/productService")>();
  return {
    ...actual,
    products: vi.fn(),
    getProductFacets: vi.fn(),
  };
});

import {
  useProducts,
  useProductFacets,
  useInfiniteProducts,
} from "@/components/hooks/useProducts";
import { products, getProductFacets } from "@/services/productService";

const mockProducts = vi.mocked(products);
const mockGetProductFacets = vi.mocked(getProductFacets);

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, Wrapper };
}

describe("useProducts / useProductFacets — priceListType en la query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProducts.mockResolvedValue([] as never);
    mockGetProductFacets.mockResolvedValue({
      categories: [],
      variants: [],
      titles: [],
    });
  });

  it("useProducts pasa priceListType como 4to argumento e incluye el queryKey", async () => {
    const { client, Wrapper } = makeWrapper();
    renderHook(() => useProducts(undefined, undefined, undefined, "WET"), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(mockProducts).toHaveBeenCalledWith(
        undefined,
        undefined,
        undefined,
        "WET",
        undefined,
      );
    });

    const keys = client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["products", "WET"]);
  });

  it("useProductFacets pasa priceListType como 2do argumento y lo incluye en el queryKey", async () => {
    const { client, Wrapper } = makeWrapper();
    renderHook(() => useProductFacets(undefined, "WET"), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(mockGetProductFacets).toHaveBeenCalledWith(undefined, "WET");
    });

    const keys = client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["product-facets", "all", "WET"]);
  });

  it("useInfiniteProducts pasa priceListType como 7mo argumento (después de title)", async () => {
    mockProducts.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 30,
      hasMore: false,
    });
    const { Wrapper } = makeWrapper();
    renderHook(
      () => useInfiniteProducts("branch-1", undefined, undefined, "KEY", "WET"),
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(mockProducts).toHaveBeenCalledWith(
        "branch-1",
        undefined,
        undefined,
        1,
        30,
        "KEY",
        "WET",
        undefined,
      );
    });
  });
});
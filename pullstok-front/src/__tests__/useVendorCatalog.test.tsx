import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/components/hooks/useProducts", () => ({
  useInfiniteProducts: vi.fn(),
  useProductFacets: vi.fn(),
  useProducts: vi.fn(),
}));

import { useVendorCatalog } from "@/components/hooks/useVendorCatalog";
import { useInfiniteProducts, useProductFacets } from "@/components/hooks/useProducts";

const mockUseInfiniteProducts = vi.mocked(useInfiniteProducts);
const mockUseProductFacets = vi.mocked(useProductFacets);

class IntersectionObserverStub {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

function renderCatalog() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderHook(() => useVendorCatalog("branch-1"), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

describe("useVendorCatalog — filtro por título de planilla (server-side)", () => {
  beforeEach(() => {
    vi.stubGlobal("IntersectionObserver", IntersectionObserverStub);
    mockUseInfiniteProducts.mockReturnValue({
      items: [],
      isLoadingInitial: false,
      isFetchingNextPage: false,
      hasNextPage: false,
      loadMore: vi.fn(),
      error: null,
    });
    mockUseProductFacets.mockReturnValue({
      categories: [{ id: "cat-1", name: "Alimentos" }],
      variants: [],
      titles: [
        { key: "MAXXIUM|MAXXIUM PERROS", label: "MAXXIUM PERROS", count: 2 },
      ],
      loading: false,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("pasa el título como 4to argumento de useInfiniteProducts (?title=)", async () => {
    const { result } = renderCatalog();

    // Sin filtro: el 4to argumento es undefined.
    expect(mockUseInfiniteProducts).toHaveBeenCalledWith(
      "branch-1",
      undefined,
      undefined,
      undefined,
    );

    act(() => {
      result.current.setTitleFilter("MAXXIUM|MAXXIUM PERROS");
    });

    await waitFor(() => {
      const calls = mockUseInfiniteProducts.mock.calls;
      const last = calls[calls.length - 1];
      expect(last[3]).toBe("MAXXIUM|MAXXIUM PERROS");
    });
    expect(result.current.titleFilter).toBe("MAXXIUM|MAXXIUM PERROS");
  });

  it("expone facetsTitles desde useProductFacets para los chips", () => {
    const { result } = renderCatalog();

    expect(result.current.facetsTitles).toEqual([
      { key: "MAXXIUM|MAXXIUM PERROS", label: "MAXXIUM PERROS", count: 2 },
    ]);
  });

  it("toggle a null deja de enviar ?title=", async () => {
    mockUseInfiniteProducts.mockClear();
    const { result } = renderCatalog();

    act(() => {
      result.current.setTitleFilter("MAXXIUM|MAXXIUM PERROS");
    });
    await waitFor(() => {
      const calls = mockUseInfiniteProducts.mock.calls;
      expect(calls[calls.length - 1][3]).toBe("MAXXIUM|MAXXIUM PERROS");
    });

    act(() => {
      result.current.setTitleFilter(null);
    });

    await waitFor(() => {
      const calls = mockUseInfiniteProducts.mock.calls;
      const last = calls[calls.length - 1];
      expect(last[3]).toBeUndefined();
    });
  });
});

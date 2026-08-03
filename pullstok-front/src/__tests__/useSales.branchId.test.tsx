import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Hoisted mock — the service layer is replaced so the hook test stays focused
// on query wiring (key, fetch-on-mount, branchId propagation).
vi.mock("../services/saleServices", () => ({
  getSales: vi.fn(),
}));

import { useGetSales } from "../components/hooks/useSales";
import { getSales } from "../services/saleServices";

const getSalesMock = vi.mocked(getSales);

function Harness({ branchId }: { branchId?: string }) {
  const { sales, loading, error } = useGetSales(branchId);
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="count">{sales.length}</span>
      <span data-testid="error">{error ? error.message : "no-error"}</span>
    </div>
  );
}

function renderWithClient(
  ui: React.ReactElement,
  client?: QueryClient,
) {
  const c =
    client ??
    new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  return {
    ...render(<QueryClientProvider client={c}>{ui}</QueryClientProvider>),
    client: c,
  };
}

describe("useGetSales — branchId in queryKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes branchId in queryKey when provided", async () => {
    getSalesMock.mockResolvedValue([{ id: "s-1", totalAmount: 50 } as any]);

    renderWithClient(<Harness branchId="br-norte" />);

    await waitFor(() =>
      expect(screen.getByTestId("count")).toHaveTextContent("1"),
    );

    expect(getSalesMock).toHaveBeenCalledWith("br-norte");
  });

  it("uses queryKey ['sales'] when branchId is undefined (backward-compat)", async () => {
    getSalesMock.mockResolvedValue([]);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    renderWithClient(<Harness />, client);

    await waitFor(() =>
      expect(screen.getByTestId("loading")).toHaveTextContent("false"),
    );

    // Verify no branchId was passed to the service function
    expect(getSalesMock).toHaveBeenCalledWith(undefined);

    // Verify the query cache key
    const cache = client.getQueryCache();
    const queries = cache.findAll({ queryKey: ["sales"] });
    expect(queries).toHaveLength(1);
  });

  it("isolates cache — ['sales', 'br-a'] and ['sales', 'br-b'] are separate queries", async () => {
    getSalesMock.mockResolvedValue([]);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { rerender } = render(
      <QueryClientProvider client={client}>
        <Harness branchId="br-a" />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("loading")).toHaveTextContent("false"),
    );

    rerender(
      <QueryClientProvider client={client}>
        <Harness branchId="br-b" />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("loading")).toHaveTextContent("false"),
    );

    // Two separate queries should exist in the cache
    const cache = client.getQueryCache();
    const queriesA = cache.findAll({ queryKey: ["sales", "br-a"] });
    const queriesB = cache.findAll({ queryKey: ["sales", "br-b"] });
    expect(queriesA).toHaveLength(1);
    expect(queriesB).toHaveLength(1);
    expect(getSalesMock).toHaveBeenCalledTimes(2);
  });
});

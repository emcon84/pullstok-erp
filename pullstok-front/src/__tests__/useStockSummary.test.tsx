import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// ---------------------------------------------------------------------------
// Hoisted mock — the service layer is replaced so the hook test stays focused
// on query wiring (key, fetch-on-mount, error propagation).
// ---------------------------------------------------------------------------
vi.mock("../services/productService", () => ({
  getStockSummary: vi.fn(),
}));

import { useStockSummary } from "../components/hooks/useStockSummary";
import { getStockSummary } from "../services/productService";

const getStockSummaryMock = vi.mocked(getStockSummary);

const summary = {
  total: 22,
  branches: [
    { branchId: "hq", branchName: "Casa Central", quantity: 15, isHeadquarters: true },
    { branchId: "b-2", branchName: "Sucursal 2", quantity: 7, isHeadquarters: false },
  ],
};

function Harness() {
  const { summary, loading, error } = useStockSummary();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="total">{summary ? summary.total : "none"}</span>
      <span data-testid="branches">
        {summary ? summary.branches.map((b) => b.branchName).join(",") : "none"}
      </span>
      <span data-testid="error">{error ? error.message : "no-error"}</span>
    </div>
  );
}

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("useStockSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches the org stock summary and exposes total + branches", async () => {
    getStockSummaryMock.mockResolvedValue(summary);
    renderWithClient(<Harness />);

    await waitFor(() =>
      expect(screen.getByTestId("total")).toHaveTextContent("22"),
    );
    expect(getStockSummaryMock).toHaveBeenCalledTimes(1);
    expect(getStockSummaryMock).toHaveBeenCalledWith();
    expect(screen.getByTestId("branches")).toHaveTextContent(
      "Casa Central,Sucursal 2",
    );
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
  });

  it("is enabled immediately: fires on mount without any gating argument", async () => {
    getStockSummaryMock.mockResolvedValue(summary);
    renderWithClient(<Harness />);

    await waitFor(() => expect(getStockSummaryMock).toHaveBeenCalledTimes(1));
    expect(getStockSummaryMock).toHaveBeenCalledWith();
  });

  it("does not refetch on repeated mounts within the same client (cached by key)", async () => {
    getStockSummaryMock.mockResolvedValue(summary);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("total")).toHaveTextContent("22"),
    );
    expect(getStockSummaryMock).toHaveBeenCalledTimes(1);

    rerender(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>,
    );
    expect(getStockSummaryMock).toHaveBeenCalledTimes(1);
  });

  it("exposes the error when the service rejects", async () => {
    getStockSummaryMock.mockRejectedValue(new Error("summary failed"));
    renderWithClient(<Harness />);

    await waitFor(() =>
      expect(screen.getByTestId("error")).toHaveTextContent("summary failed"),
    );
    expect(screen.getByTestId("total")).toHaveTextContent("none");
  });
});

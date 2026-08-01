import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import React from "react";

// ---------------------------------------------------------------------------
// Hoisted mocks — the service layer is replaced so the hook test stays focused
// on query/mutation wiring (keys, enabled flag, call args, invalidation).
// ---------------------------------------------------------------------------
vi.mock("../services/productService", () => ({
  getProductStock: vi.fn(),
  updateBranchStock: vi.fn(),
}));

import { useProductStock } from "../components/hooks/useProductStock";
import { getProductStock, updateBranchStock } from "../services/productService";

const getProductStockMock = vi.mocked(getProductStock);
const updateBranchStockMock = vi.mocked(updateBranchStock);

const hqBranch = {
  branchId: "hq",
  branchName: "Casa Central",
  quantity: 5,
  isHeadquarters: true,
  canEdit: true,
};

const stockResponse = (branches: typeof hqBranch[]) => ({
  productId: "p1",
  branches,
});

function Harness({ productId }: { productId?: string | null }) {
  const { stock, loading, updateBranchStock } = useProductStock(productId);
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="branches">
        {stock ? stock.branches.map((b) => b.branchName).join(",") : "none"}
      </span>
      <button onClick={() => updateBranchStock({ branchId: "hq", quantity: 7 })}>
        save
      </button>
    </div>
  );
}

/** Registers a ["products"] query so invalidation is observable via refetch. */
function ProductsProbe() {
  useQuery({ queryKey: ["products"], queryFn: productsFetch });
  return null;
}

const productsFetch = vi.fn();

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("useProductStock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    productsFetch.mockResolvedValue([{ id: "x" }]);
  });

  it("fetches the self-contained stock for the product id", async () => {
    getProductStockMock.mockResolvedValue(stockResponse([hqBranch]));
    renderWithClient(<Harness productId="p1" />);

    await waitFor(() =>
      expect(screen.getByTestId("branches")).toHaveTextContent("Casa Central"),
    );
    expect(getProductStockMock).toHaveBeenCalledWith("p1");
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
  });

  it("does not fetch when productId is falsy (create mode)", () => {
    getProductStockMock.mockResolvedValue(stockResponse([hqBranch]));
    renderWithClient(<Harness productId={null} />);

    expect(getProductStockMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("branches")).toHaveTextContent("none");
  });

  it("updates a branch stock via the PUT service with id, branchId and quantity", async () => {
    getProductStockMock.mockResolvedValue(stockResponse([hqBranch]));
    updateBranchStockMock.mockResolvedValue({ branchId: "hq", quantity: 7 });
    renderWithClient(<Harness productId="p1" />);

    await waitFor(() =>
      expect(screen.getByTestId("branches")).toHaveTextContent("Casa Central"),
    );
    fireEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() =>
      expect(updateBranchStockMock).toHaveBeenCalledWith("p1", "hq", 7),
    );
  });

  it("invalidates both the products list and the branch-stock query after an update", async () => {
    getProductStockMock.mockResolvedValue(stockResponse([hqBranch]));
    updateBranchStockMock.mockResolvedValue({ branchId: "hq", quantity: 7 });
    renderWithClient(
      <>
        <Harness productId="p1" />
        <ProductsProbe />
      </>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("branches")).toHaveTextContent("Casa Central"),
    );
    expect(getProductStockMock).toHaveBeenCalledTimes(1);
    expect(productsFetch).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "save" }));

    // Mutation success → both queries refetch (initial + 1 invalidation).
    await waitFor(() => expect(getProductStockMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(productsFetch).toHaveBeenCalledTimes(2));
  });
});

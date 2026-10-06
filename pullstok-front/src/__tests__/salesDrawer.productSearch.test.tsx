import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/services/productService", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/productService")>();
  return { ...actual, products: vi.fn() };
});

import { SalesDrawer } from "@/components/molecules/SalesDrawer";
import { products } from "@/services/productService";

const mockProducts = vi.mocked(products);

const page = (hasMore: boolean, pageNo = 1) =>
  ({
    items: [{ _id: `p${pageNo}`, name: `Producto ${pageNo}`, price: 10, quantity: 1 }],
    page: pageNo,
    hasMore,
  }) as never;

function renderDrawer() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SalesDrawer
        isOpen
        onClose={vi.fn()}
        title="Nueva venta"
        onConfirm={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe("SalesDrawer — server-side product search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProducts.mockResolvedValue(page(false));
  });

  it("does not fetch products while the selector is closed", async () => {
    renderDrawer();
    await new Promise((r) => setTimeout(r, 30));
    expect(mockProducts).not.toHaveBeenCalled();
  });

  it("opening the selector triggers a paginated server-side fetch and lists results", async () => {
    renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: /Agregar productos/ }));

    await waitFor(() => expect(mockProducts).toHaveBeenCalled());
    // page 1 with the PAGE_SIZE (30) pagination args
    const args = mockProducts.mock.calls[0];
    expect(args[3]).toBe(1);
    expect(args[4]).toBe(30);
    expect(await screen.findByText("Producto 1")).toBeInTheDocument();
  });

  it("'Ver más resultados' fetches the next page", async () => {
    mockProducts
      .mockResolvedValueOnce(page(true, 1))
      .mockResolvedValueOnce(page(false, 2));
    renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: /Agregar productos/ }));

    fireEvent.click(await screen.findByRole("button", { name: "Ver más resultados" }));

    expect(await screen.findByText("Producto 2")).toBeInTheDocument();
    expect(mockProducts.mock.calls[1][3]).toBe(2);
  });
});

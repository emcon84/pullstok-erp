import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DataItem } from "@/types";

vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/components/hooks/useProducts", () => ({
  useDeleteProduct: () => ({ deleteProduct: vi.fn(), loading: false }),
}));
vi.mock("@/components/hooks/useConfirm", () => ({
  useConfirm: () => vi.fn(),
}));

vi.mock("@/components/hooks/vendorCatalogHelpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/hooks/vendorCatalogHelpers")>();
  return { ...actual, unitStock: vi.fn(actual.unitStock) };
});

import { unitStock } from "@/components/hooks/vendorCatalogHelpers";
import { ProductsTable } from "@/components/molecules/ProductsTable";

// Largo único para distinguir el sort de la tabla de cualquier otro .sort().
const TOTAL = 37;
const products: DataItem[] = Array.from({ length: TOTAL }, (_, i) => ({
  _id: `p-${i}`,
  name: `Producto ${String(i).padStart(2, "0")}`,
  code: `C${i}`,
  price: 100 + i,
  quantity: i % 3,
}));

const noop = vi.fn();

describe("ProductsTable — el orden no se recalcula en cada render", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("un cambio de estado ajeno al orden (seleccionar una fila) no vuelve a ordenar la lista", () => {
    const sortSpy = vi.spyOn(Array.prototype, "sort");
    const tableSorts = () =>
      sortSpy.mock.contexts.filter(
        (ctx) => Array.isArray(ctx) && ctx.length === TOTAL,
      ).length;

    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <ProductsTable
            products={products}
            onEdit={noop}
            onDuplicate={noop}
            onQuickPrice={noop}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const afterMount = tableSorts();
    expect(afterMount).toBeGreaterThanOrEqual(1);

    // Tildar el checkbox de una fila cambia `selectedIds` → re-render interno.
    const rowCheckbox = screen.getAllByRole("checkbox")[1];
    fireEvent.click(rowCheckbox);

    expect(tableSorts()).toBe(afterMount);
  });

  it("re-render del padre con las MISMAS props no vuelve a renderizar la tabla", () => {
    const onEdit = vi.fn();
    const onDuplicate = vi.fn();
    const onQuickPrice = vi.fn();
    const tree = () => (
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <ProductsTable
            products={products}
            onEdit={onEdit}
            onDuplicate={onDuplicate}
            onQuickPrice={onQuickPrice}
          />
        </MemoryRouter>
      </QueryClientProvider>
    );
    const qc = new QueryClient();
    const { rerender } = render(tree());
    vi.mocked(unitStock).mockClear();

    rerender(tree());

    expect(unitStock).not.toHaveBeenCalled();
  });
});

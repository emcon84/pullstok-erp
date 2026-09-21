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
});

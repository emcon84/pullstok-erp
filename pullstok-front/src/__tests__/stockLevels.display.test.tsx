import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DataItem } from "@/types";

vi.mock("react-toastify", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/components/hooks/useProducts", () => ({
  useDeleteProduct: () => ({ deleteProduct: vi.fn(), loading: false }),
}));
vi.mock("@/components/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }));

import { stockBadgeLabel, unitStock } from "@/components/hooks/vendorCatalogHelpers";
import { ProductsTable } from "@/components/molecules/ProductsTable";
import { ProductSelector } from "@/components/molecules/ProductSelector";
import { LevelStockInput } from "@/components/molecules/LevelStockInput";

const presentations = [
  { id: "a", name: "Caja", factor: 100, price: 1000, wholesalePrice: null, sortOrder: 0 },
  { id: "b", name: "Blister", factor: 10, price: 150, wholesalePrice: null, sortOrder: 1 },
  { id: "c", name: "Unidad", factor: 1, price: 20, wholesalePrice: null, sortOrder: 2 },
];

const presentationProduct: DataItem = {
  _id: "p1",
  name: "Ibuprofeno",
  code: "IBU",
  price: 20,
  quantity: 235,
  weightKg: 5,
  hasPresentations: true,
  presentations,
};
const legacyProduct: DataItem = { _id: "p2", name: "Collar", code: "COL", price: 50, quantity: 7 };

describe("stock helpers for presentation products", () => {
  it("unitStock returns the base-unit quantity without the weightKg conversion", () => {
    expect(unitStock(presentationProduct)).toBe(235);
    expect(unitStock({ ...presentationProduct, stocks: [{ quantity: 12 }] } as DataItem)).toBe(12);
  });

  it("legacy products keep the kg→bags fallback", () => {
    expect(unitStock({ name: "x", price: 1, quantity: 30, weightKg: 15 })).toBe(2);
  });

  it("stockBadgeLabel shows levels for presentation products and 'u.' otherwise", () => {
    expect(stockBadgeLabel(presentationProduct, 235)).toBe("2 Caja · 3 Blister · 5 Unidad");
    expect(stockBadgeLabel(presentationProduct, 0)).toBe("0 Unidad");
    expect(stockBadgeLabel(legacyProduct, 7)).toBe("7 u.");
  });
});

describe("ProductsTable — stock in levels", () => {
  const renderTable = (products: DataItem[]) =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <ProductsTable products={products} onEdit={vi.fn()} onDuplicate={vi.fn()} onQuickPrice={vi.fn()} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

  it("shows the stock split by presentation for hasPresentations products", () => {
    renderTable([presentationProduct]);
    expect(screen.getAllByText("2 Caja · 3 Blister · 5 Unidad").length).toBeGreaterThan(0);
    expect(screen.queryByText("235 u.")).not.toBeInTheDocument();
  });

  it("keeps the plain 'u.' label for legacy products", () => {
    renderTable([legacyProduct]);
    expect(screen.getAllByText("7 u.").length).toBeGreaterThan(0);
  });
});

describe("ProductSelector — stock in levels", () => {
  it("shows levels for presentation products and the raw number for legacy ones", () => {
    render(
      <ProductSelector
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        products={[presentationProduct, legacyProduct] as never}
      />,
    );
    expect(screen.getByText(/Stock 2 Caja · 3 Blister · 5 Unidad/)).toBeInTheDocument();
    expect(screen.getByText(/Stock 7/)).toBeInTheDocument();
  });
});

describe("LevelStockInput", () => {
  it("seeds one input per presentation from the base quantity", () => {
    render(<LevelStockInput label="Casa Central" quantity={235} presentations={presentations} saving={false} onSave={vi.fn()} />);
    expect(screen.getByLabelText("Caja de Casa Central")).toHaveValue(2);
    expect(screen.getByLabelText("Blister de Casa Central")).toHaveValue(3);
    expect(screen.getByLabelText("Unidad de Casa Central")).toHaveValue(5);
  });

  it("saves the levels converted to base units", () => {
    const onSave = vi.fn();
    render(<LevelStockInput label="Casa Central" quantity={235} presentations={presentations} saving={false} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText("Caja de Casa Central"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Unidad de Casa Central"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(onSave).toHaveBeenCalledWith(330);
  });

  it("treats empty inputs as zero and shows the base total", () => {
    const onSave = vi.fn();
    render(<LevelStockInput label="S" quantity={0} presentations={presentations} saving={false} onSave={onSave} />);
    expect(screen.getByText("= 0 unidades base")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Blister de S"), { target: { value: "2" } });
    expect(screen.getByText("= 20 unidades base")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(onSave).toHaveBeenCalledWith(20);
  });

  it("disables saving while a save is in flight", () => {
    render(<LevelStockInput label="S" quantity={1} presentations={presentations} saving onSave={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Guardando..." })).toBeDisabled();
  });
});

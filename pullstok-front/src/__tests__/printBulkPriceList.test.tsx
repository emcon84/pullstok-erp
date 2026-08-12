import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PrintBulkPriceList } from "@/components/molecules/PrintBulkPriceList";
import type { BulkPricePreviewRow } from "@/services/productService";

function row(overrides: Partial<BulkPricePreviewRow> = {}): BulkPricePreviewRow {
  return {
    id: "r-" + Math.random().toString(36).slice(2, 8),
    name: "Producto",
    categoryName: "Alimentos",
    brandValues: ["Acme"],
    oldPrice: 100,
    newPrice: 110,
    delta: 10,
    effectivePercentage: 10,
    ...overrides,
  };
}

describe("PrintBulkPriceList — listado imprimible de precios actualizados", () => {
  it("muestra todas las filas sin paginar", () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      row({ name: `Producto ${i + 1}` }),
    );

    render(<PrintBulkPriceList rows={rows} />);

    for (let i = 1; i <= 12; i++) {
      expect(screen.getByText(`Producto ${i}`)).toBeInTheDocument();
    }
  });

  it("muestra SOLO nombre y precio nuevo", () => {
    const r = row({ name: "Purina Pro Plan", newPrice: 15500.5, oldPrice: 15000, categoryName: "Alimentos", brandValues: ["Purina"] });

    render(<PrintBulkPriceList rows={[r]} />);

    expect(screen.getByText("Purina Pro Plan")).toBeInTheDocument();
    expect(screen.getByText("$ 15.500,5")).toBeInTheDocument();
    // Nada más: sin categoría, marca, % ni precio viejo
    expect(screen.queryByText("Alimentos")).not.toBeInTheDocument();
    expect(screen.queryByText("Purina")).not.toBeInTheDocument();
    expect(screen.queryByText("$ 15.000")).not.toBeInTheDocument();
    expect(screen.queryByText("10%")).not.toBeInTheDocument();
  });

  it("muestra la línea con el conteo de productos", () => {
    render(<PrintBulkPriceList rows={[row(), row()]} />);

    expect(screen.getByText(/2 productos/)).toBeInTheDocument();
    expect(screen.getByText(/\d{1,2}\/\d{1,2}\/\d{2,4}/)).toBeInTheDocument();
  });

  it("muestra el mensaje vacío cuando no hay filas", () => {
    render(<PrintBulkPriceList rows={[]} />);

    expect(screen.getByText("No hay productos.")).toBeInTheDocument();
  });
});

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PrintProductList } from "@/components/molecules/PrintProductList";
import type { DataItem } from "@/types";

function product(overrides: Partial<DataItem> = {}): DataItem {
  return {
    _id: "p-" + Math.random().toString(36).slice(2, 8),
    name: "Producto",
    code: "CODE",
    price: 1000,
    quantity: 4,
    ...overrides,
  };
}

describe("PrintProductList — listado de productos imprimible", () => {
  it("muestra todos los productos sin paginar", () => {
    const products = Array.from({ length: 12 }, (_, i) =>
      product({ name: `Producto ${i + 1}` }),
    );

    render(<PrintProductList products={products} />);

    for (let i = 1; i <= 12; i++) {
      expect(screen.getByText(`Producto ${i}`)).toBeInTheDocument();
    }
  });

  it("muestra nombre, código, categoría, unidad de stock y precio formateado", () => {
    const p = {
      _id: "p-cat",
      name: "Collar de Cuero",
      code: "COL-01",
      price: 1500,
      quantity: 5,
      priceKgSuelto: 1500,
      category: { name: "Accesorios" },
    } as unknown as DataItem;

    render(<PrintProductList products={[p]} />);

    expect(screen.getByText("Collar de Cuero")).toBeInTheDocument();
    expect(screen.getByText("COL-01")).toBeInTheDocument();
    expect(screen.getByText("Accesorios")).toBeInTheDocument();
    expect(screen.getByText("5 kg")).toBeInTheDocument();
    expect(screen.getByText("$ 1.500")).toBeInTheDocument();
  });

  it("usa 'u.' como unidad cuando el producto no se vende por kg", () => {
    const p = product({ name: "Bozal", code: "BZ-01", priceKgSuelto: 0, quantity: 3 });

    render(<PrintProductList products={[p]} />);

    expect(screen.getByText("3 u.")).toBeInTheDocument();
  });

  it("respeta el stock por sucursal (stocks[0].quantity) en branchMode", () => {
    const p = product({
      name: "Correa",
      code: "CO-01",
      quantity: 99,
      stocks: [{ quantity: 7 }],
    });

    render(<PrintProductList products={[p]} branchMode />);

    expect(screen.getByText("7 u.")).toBeInTheDocument();
    expect(screen.queryByText("99 u.")).not.toBeInTheDocument();
  });

  it("sin branchMode prioriza stocks[0].quantity con fallback a quantity", () => {
    const p = product({
      name: "Cepillo",
      code: "CE-01",
      quantity: 8,
      stocks: [{ quantity: 2 }],
    });

    render(<PrintProductList products={[p]} />);

    expect(screen.getByText("2 u.")).toBeInTheDocument();
  });

  it("muestra la línea con el conteo de productos", () => {
    render(<PrintProductList products={[product(), product()]} />);

    expect(screen.getByText(/2 productos/)).toBeInTheDocument();
    expect(screen.getByText(/\d{1,2}\/\d{1,2}\/\d{2,4}/)).toBeInTheDocument();
  });

  it("muestra el mensaje vacío cuando no hay productos", () => {
    render(<PrintProductList products={[]} />);

    expect(screen.getByText("No hay productos todavía.")).toBeInTheDocument();
  });
});
